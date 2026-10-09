/** Original Harbor City spatial blueprint. Geometry is authored; gameplay integration and interiors remain unfinished. */
import { WORLD as PROLOGUE } from './prologue-world.js';
import { createSpatialIndex } from './spatial-index.js';

// Runtime contains original names and stable catalogue IDs only. Source names remain in the research documents.
const CATALOGUE = {
  areas: [
    {
      id: 'LL-CITY-N001',
      name: 'Crane Ward',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'warehouse underpasses',
      affordances:
        'Freight arcades under a raised causeway; service stairs linking the quays to workshops.',
    },
    {
      id: 'LL-CITY-N002',
      name: 'Saltgate',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'coastal villas',
      affordances: 'A sheltered seawall lane; a gated estate with a public beach detour.',
    },
    {
      id: 'LL-CITY-N003',
      name: 'Kiln Row',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'mixed tenements and trades',
      affordances: 'A steep repair-shop street; roof-connected residential courts.',
    },
    {
      id: 'LL-CITY-N004',
      name: 'Dispatch Quarter',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'old commercial blocks',
      affordances: 'A cab-cooperative yard; a split-level market square with loading alleys.',
    },
    {
      id: 'LL-CITY-N005',
      name: 'Pier Eight',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'working waterfront',
      affordances:
        'Warehouse slipways and a ship berth; fenced cargo routes with multiple human-scale approaches.',
    },
    {
      id: 'LL-CITY-N006',
      name: 'Lantern Boardwalk',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'faded seaside entertainment',
      affordances:
        'A weathered pier promenade; a closed fairground serving an active bowling venue.',
    },
    {
      id: 'LL-CITY-N007',
      name: 'Breakwater Courts',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'public housing terraces',
      affordances: 'Open communal courts; connected stair towers and rooftop access routes.',
    },
    {
      id: 'LL-CITY-N008',
      name: 'Old Quay',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'immigrant waterfront streets',
      affordances:
        'Night kitchens around a passenger landing; broad steps linking homes to the boardwalk.',
    },
    {
      id: 'LL-CITY-N009',
      name: 'Orchard Rise',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'park-edge residential',
      affordances:
        'A terraced park entry; a woodland path network contrasting the surrounding streets.',
    },
    {
      id: 'LL-CITY-N010',
      name: 'Signal Hill',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'rising townhouses',
      affordances:
        'Hillcrest viewpoints and switchback streets; fire escapes connecting narrow terraces.',
    },
    {
      id: 'LL-CITY-N011',
      name: 'Founders Walk',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'dense workshops and housing',
      affordances:
        'A clinic approach and small civic garden; rear shop courts suitable for courier travel.',
    },
    {
      id: 'LL-CITY-N012',
      name: 'Rainstep',
      district: 'Breakwater',
      kind: 'neighbourhood_or_town',
      architecture: 'hillside family streets',
      affordances:
        'Short steep lanes; a foot-stair route offering a useful alternative to the road.',
    },
    {
      id: 'LL-CITY-N013',
      name: 'Brigid Market',
      district: 'Saint Brigid',
      kind: 'neighbourhood_or_town',
      architecture: 'mixed neighbourhood retail',
      affordances:
        'A busy covered market; a grade-separated station crossing with distinct platform approaches.',
    },
    {
      id: 'LL-CITY-N014',
      name: 'Pump Island',
      district: 'Saint Brigid',
      kind: 'offshore_island',
      architecture: 'utility island',
      affordances:
        'Working pump/sewage infrastructure; public sports grounds divided from secured utility access.',
    },
    {
      id: 'LL-CITY-N015',
      name: 'Foundry Reach',
      district: 'Saint Brigid',
      kind: 'neighbourhood_or_town',
      architecture: 'arts and light industry',
      affordances: 'Converted machine halls; rail-adjacent workshops opening to waterfront plazas.',
    },
    {
      id: 'LL-CITY-N016',
      name: 'Harbor Airfield',
      district: 'Saint Brigid',
      kind: 'airport_precinct',
      architecture: 'airport and cargo campus',
      affordances:
        'Arrival forecourt and rail terminal; controlled cargo apron, hangars and service-vehicle paths.',
    },
    {
      id: 'LL-CITY-N017',
      name: 'Cedar Terrace',
      district: 'Saint Brigid',
      kind: 'neighbourhood_or_town',
      architecture: 'garden suburbs',
      affordances:
        'Curving residential streets; a raised station reached through a neighbourhood shopping court.',
    },
    {
      id: 'LL-CITY-N018',
      name: 'Worlds Garden',
      district: 'Saint Brigid',
      kind: 'neighbourhood_or_town',
      architecture: 'large civic park',
      affordances: 'A sculptural exhibition plaza; linked lakeside paths and sports grounds.',
    },
    {
      id: 'LL-CITY-N019',
      name: 'Bellhaven',
      district: 'Saint Brigid',
      kind: 'neighbourhood_or_town',
      architecture: 'pub streets and waterfront estates',
      affordances:
        'A pub square with darts; cemetery and waterside paths connecting a low-rise housing enclave.',
    },
    {
      id: 'LL-CITY-N020',
      name: 'Flightpath',
      district: 'Saint Brigid',
      kind: 'neighbourhood_or_town',
      architecture: 'airport-edge mixed housing',
      affordances: 'Aircraft-lit local streets; a vehicle wash and logistics slip-road network.',
    },
    {
      id: 'LL-CITY-N021',
      name: 'Northwater',
      district: 'The Narrows',
      kind: 'neighbourhood_or_town',
      architecture: 'park boulevard',
      affordances:
        'A public lake and ball field; broad roads narrowing into old residential stairs.',
    },
    {
      id: 'LL-CITY-N022',
      name: 'Canal Works',
      district: 'The Narrows',
      kind: 'neighbourhood_or_town',
      architecture: 'waterside industrial plots',
      affordances:
        'Scrap and repair yards; interrupted construction ramps with usable ground-level detours.',
    },
    {
      id: 'LL-CITY-N023',
      name: 'Foundry Steps',
      district: 'The Narrows',
      kind: 'neighbourhood_or_town',
      architecture: 'commercial hill junction',
      affordances:
        'A precinct forecourt and market; steep alleys linking transport to dense housing.',
    },
    {
      id: 'LL-CITY-N024',
      name: 'Dry Basin',
      district: 'The Narrows',
      kind: 'neighbourhood_or_town',
      architecture: 'dockside sheds',
      affordances:
        'An original evidence warehouse; unfinished flood infrastructure and water-access ladders.',
    },
    {
      id: 'LL-CITY-N025',
      name: 'Tidal Corner',
      district: 'The Narrows',
      kind: 'neighbourhood_or_town',
      architecture: 'small coastal housing',
      affordances:
        'A bluff walk and sheltered landing; an adult venue reached through ordinary public streets.',
    },
    {
      id: 'LL-CITY-N026',
      name: 'Longcourt',
      district: 'The Narrows',
      kind: 'neighbourhood_or_town',
      architecture: 'large residential estate',
      affordances:
        'Community halls and interlinked courtyards; an emergency-services corridor with play spaces.',
    },
    {
      id: 'LL-CITY-N027',
      name: 'Canal Refuge',
      district: 'The Narrows',
      kind: 'neighbourhood_or_town',
      architecture: 'dense southern tenements',
      affordances:
        'The refuge home and local kitchens; alleys and a station stair entry offering distinct escape routes.',
    },
    {
      id: 'LL-CITY-N028',
      name: 'East Assembly',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'mixed urban housing',
      affordances:
        'Resident-run shops and an assembly hall; shared rear courts and a school frontage.',
    },
    {
      id: 'LL-CITY-N029',
      name: 'Guildbank',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'upmarket residential',
      affordances:
        'Restaurant terraces and hotel forecourts; narrow service lanes behind broad avenues.',
    },
    {
      id: 'LL-CITY-N030',
      name: 'Civic Orchard',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'major central park',
      affordances:
        'A lake/causeway landscape; performance lawns and subterranean maintenance approaches.',
    },
    {
      id: 'LL-CITY-N031',
      name: 'Orchard East',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'affluent park frontage',
      affordances:
        'A later story home and formal outfitter; differentiated street and service entrances.',
    },
    {
      id: 'LL-CITY-N032',
      name: 'Orchard West',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'cultural park frontage',
      affordances:
        'An original art centre; park-facing apartment lobbies with roof/terrace routes.',
    },
    {
      id: 'LL-CITY-N033',
      name: 'West Assembly',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'busy mixed residential',
      affordances:
        'An equipment/community corridor; a computer cafe and active streets around a large clinic.',
    },
    {
      id: 'LL-CITY-N034',
      name: 'Reservoir Ward',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'northern housing and depots',
      affordances: 'A tower-estate courtyard; a visible rail crossing and repair-work forecourt.',
    },
    {
      id: 'LL-CITY-N035',
      name: 'Scholar Heights',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'university hill',
      affordances:
        'Campus quads and civic stairs; elevated paths joining the central park to river roads.',
    },
    {
      id: 'LL-CITY-N036',
      name: 'Beacon Island',
      district: 'Glassward',
      kind: 'offshore_island',
      architecture: 'historic service island',
      affordances:
        'A lighthouse and memorial gardens; an abandoned clinic with waterside construction paths.',
    },
    {
      id: 'LL-CITY-N037',
      name: 'Grand Union',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'rail-centred commerce',
      affordances:
        'An original terminal landmark; a connected multi-line subway interchange and surrounding arcades.',
    },
    {
      id: 'LL-CITY-N038',
      name: 'Spire Gardens',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'formal shopping streets',
      affordances: 'A distinct skyline tower courtyard; restaurants and raised retail terraces.',
    },
    {
      id: 'LL-CITY-N039',
      name: 'Ledger East',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'medical and office district',
      affordances:
        'An outpatient square; canal-side towers with service ramps and a route into underground transit.',
    },
    {
      id: 'LL-CITY-N040',
      name: 'Coldstore',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'converted warehouse nightlife',
      affordances:
        'A freight-era pier and bowling venue; mixed workshops and stage venues with back-street loading.',
    },
    {
      id: 'LL-CITY-N041',
      name: 'Civic Reach',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'eastern housing enclave',
      affordances:
        'A waterfront housing court; bridge and gondola approaches set apart from local streets.',
    },
    {
      id: 'LL-CITY-N042',
      name: 'Lowlight Row',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'nightlife and old workshops',
      affordances:
        'A pub/repair strip; a lit theatre street connecting darker industrial alleyways.',
    },
    {
      id: 'LL-CITY-N043',
      name: 'Neon Cross',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'media and advertising core',
      affordances:
        'Original billboards and studio fronts; distinct corner plazas with crowd and traffic rhythms.',
    },
    {
      id: 'LL-CITY-N044',
      name: 'Three Corners',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'wedge-shaped commercial district',
      affordances:
        'A triangular civic building; three-way street approaches and side streets for foot travel.',
    },
    {
      id: 'LL-CITY-N045',
      name: 'River Quarter',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'west-side mixed commerce',
      affordances:
        'A reused viaduct and active loading streets; a river-side walk and public helipad.',
    },
    {
      id: 'LL-CITY-N046',
      name: 'Seawall Quarter',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'planned waterside housing',
      affordances:
        'A partly built ferry precinct; stepped seawalls, residential walkways and a traffic-safe forecourt.',
    },
    {
      id: 'LL-CITY-N047',
      name: 'South Lantern',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'southern civic park',
      affordances:
        'A sculpture peninsula and waterfront gardens; a coastal road tunnel with distinct pedestrian bypass.',
    },
    {
      id: 'LL-CITY-N048',
      name: 'Lantern Market',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'specialist market streets',
      affordances:
        'Dense food/shopping lanes; a discreet basement supplier and neighbourhood courtyards.',
    },
    {
      id: 'LL-CITY-N049',
      name: 'Civic Square',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'public administration core',
      affordances:
        'An original flood-response hall; civic steps, public records frontage and clinic approach.',
    },
    {
      id: 'LL-CITY-N050',
      name: 'Bourse',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'financial towers',
      affordances:
        'An original commodity auction/corporate plaza; connected service basements and broad exposed streets.',
    },
    {
      id: 'LL-CITY-N051',
      name: 'Auction Quay',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'working fish docks',
      affordances:
        'Market stalls and freight gates; narrow waterfront escape routes and watercraft access.',
    },
    {
      id: 'LL-CITY-N052',
      name: 'Southbank',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'southern waterfront leisure',
      affordances: 'Helitour departures and a large pier; restaurants and raised waterfront walks.',
    },
    {
      id: 'LL-CITY-N053',
      name: 'Lantern Island',
      district: 'Glassward',
      kind: 'offshore_island',
      architecture: 'tourist landmark island',
      affordances:
        'An original lighthouse memorial monument; boat-only arrival and an internal discovery chamber.',
    },
    {
      id: 'LL-CITY-N054',
      name: 'Copper Table',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'old restaurant streets',
      affordances:
        'A family restaurant courtyard; intimate terrace streets contrasted with larger office roads.',
    },
    {
      id: 'LL-CITY-N055',
      name: 'Lower Ledger',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'public safety and commerce',
      affordances:
        'A law-enforcement headquarters forecourt; an original bank/evidence scene and dense service alleys.',
    },
    {
      id: 'LL-CITY-N056',
      name: 'Arts Quarter',
      district: 'Glassward',
      kind: 'neighbourhood_or_town',
      architecture: 'small galleries and retail',
      affordances:
        'Studio courtyards and an old church; rail and street entrances separated by walkable lanes.',
    },
    {
      id: 'LL-CITY-N057',
      name: 'Cliffside',
      district: 'Ironhaven',
      kind: 'neighbourhood_or_town',
      architecture: 'affluent coast and hills',
      affordances:
        'Cliff roads and wooded estate grounds; an abandoned mansion with a hidden vehicle approach.',
    },
    {
      id: 'LL-CITY-N058',
      name: 'North Foundry',
      district: 'Ironhaven',
      kind: 'neighbourhood_or_town',
      architecture: 'mixed northern suburb',
      affordances:
        'A hospital/service avenue; an elevated-road undercroft and surrounding small businesses.',
    },
    {
      id: 'LL-CITY-N059',
      name: 'Ironhaven Centre',
      district: 'Ironhaven',
      kind: 'neighbourhood_or_town',
      architecture: 'industrial-state downtown',
      affordances:
        'A ferry/helipad approach and construction tower; distinctly scaled public and office streets.',
    },
    {
      id: 'LL-CITY-N060',
      name: 'Brickhaven',
      district: 'Ironhaven',
      kind: 'neighbourhood_or_town',
      architecture: 'dense mixed waterfront',
      affordances:
        'Original computer cafe and firehouse; close terraces with warehouse-backed gardens.',
    },
    {
      id: 'LL-CITY-N061',
      name: 'Forge Ward',
      district: 'Ironhaven',
      kind: 'neighbourhood_or_town',
      architecture: 'working-class industrial town',
      affordances:
        'A civic park and contractor club frontage; a maze of alleys around older housing blocks.',
    },
    {
      id: 'LL-CITY-N062',
      name: 'Anchor Reach',
      district: 'Ironhaven',
      kind: 'neighbourhood_or_town',
      architecture: 'shipbuilding waterfront',
      affordances:
        'An original port authority yard; broad ship-service streets joined to narrow foot approaches.',
    },
    {
      id: 'LL-CITY-N063',
      name: 'Furnace Terrace',
      district: 'Ironhaven',
      kind: 'neighbourhood_or_town',
      architecture: 'mixed housing and heavy services',
      affordances:
        'Residential towers beside industrial approaches; a derelict crossing and staged ground/height routes.',
    },
    {
      id: 'LL-CITY-N064',
      name: 'Freightgate',
      district: 'Ironhaven',
      kind: 'neighbourhood_or_town',
      architecture: 'cargo port',
      affordances:
        'An active collector/supplier corridor; fenced cargo yards and water-access quays.',
    },
    {
      id: 'LL-CITY-N065',
      name: 'Reactor Basin',
      district: 'Ironhaven',
      kind: 'neighbourhood_or_town',
      architecture: 'heavy utility campus',
      affordances:
        'An original energy/flood-pump campus; elevated walkways, tanks and secured-access ground routes.',
    },
  ],
  locations: [
    {
      id: 'LL-CITY-LOC001',
      name: 'Dockside Kitchen — Kiln Row Kitchen',
      district: 'Breakwater',
      areaId: 'LL-CITY-N003',
      kind: 'fast_food_branch',
      access: 'public_food_service',
    },
    {
      id: 'LL-CITY-LOC002',
      name: 'Dockside Kitchen — Brigid Shuttered Kitchen',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N013',
      kind: 'fast_food_branch',
      access: 'closed_facade',
    },
    {
      id: 'LL-CITY-LOC003',
      name: 'Dockside Kitchen — Steps Kitchen',
      district: 'The Narrows',
      areaId: 'LL-CITY-N023',
      kind: 'fast_food_branch',
      access: 'public_food_service',
    },
    {
      id: 'LL-CITY-LOC004',
      name: 'Dockside Kitchen — Dry Basin Kitchen',
      district: 'The Narrows',
      areaId: 'LL-CITY-N024',
      kind: 'fast_food_branch',
      access: 'public_food_service',
    },
    {
      id: 'LL-CITY-LOC005',
      name: 'Dockside Kitchen — Neon Cross Kitchen',
      district: 'Glassward',
      areaId: 'LL-CITY-N043',
      kind: 'fast_food_branch',
      access: 'public_food_service',
    },
    {
      id: 'LL-CITY-LOC006',
      name: 'Dockside Kitchen — Assembly Kitchen',
      district: 'Glassward',
      areaId: 'LL-CITY-N033',
      kind: 'fast_food_branch',
      access: 'public_food_service',
    },
    {
      id: 'LL-CITY-LOC007',
      name: 'Dockside Kitchen — Coldstore Pier Kitchen',
      district: 'Glassward',
      areaId: 'LL-CITY-N040',
      kind: 'fast_food_branch',
      access: 'public_food_service',
    },
    {
      id: 'LL-CITY-LOC008',
      name: 'Dockside Kitchen — Cliffside Kitchen',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N057',
      kind: 'fast_food_branch',
      access: 'public_food_service',
    },
    {
      id: 'LL-CITY-LOC009',
      name: 'Dockside Kitchen — Lantern Lanes Kitchen',
      district: 'Breakwater',
      areaId: 'LL-CITY-N006',
      kind: 'fast_food_branch',
      access: 'integrated_food_counter',
    },
    {
      id: 'LL-CITY-LOC010',
      name: 'Dockside Kitchen — Coldstore Lanes Kitchen',
      district: 'Glassward',
      areaId: 'LL-CITY-N040',
      kind: 'fast_food_branch',
      access: 'integrated_food_counter',
    },
    {
      id: 'LL-CITY-LOC011',
      name: 'Market Roost — Brigid Market Roost',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N013',
      kind: 'fast_food_branch',
      access: 'public_food_service',
    },
    {
      id: 'LL-CITY-LOC012',
      name: 'Market Roost — Three Corners Roost',
      district: 'Glassward',
      areaId: 'LL-CITY-N044',
      kind: 'fast_food_branch',
      access: 'public_food_service',
    },
    {
      id: 'LL-CITY-LOC013',
      name: 'Market Roost — Reservoir Closed Roost',
      district: 'Glassward',
      areaId: 'LL-CITY-N034',
      kind: 'fast_food_branch',
      access: 'closed_facade',
    },
    {
      id: 'LL-CITY-LOC014',
      name: 'Market Roost — Brickhaven Closed Roost',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N060',
      kind: 'fast_food_branch',
      access: 'closed_facade',
    },
    {
      id: 'LL-CITY-LOC015',
      name: 'Night Window Pizza — Flightpath Pizza',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N020',
      kind: 'pizza_branch',
      access: 'exterior_only_not_social_destination',
    },
    {
      id: 'LL-CITY-LOC016',
      name: 'Night Window Pizza — North Foundry Pizza',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N058',
      kind: 'pizza_branch',
      access: 'social_dining_destination',
    },
    {
      id: 'LL-CITY-LOC017',
      name: 'Night Window Pizza — Brickhaven Pizza',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N060',
      kind: 'pizza_branch',
      access: 'exterior_only_not_social_destination',
    },
    {
      id: 'LL-CITY-LOC018',
      name: 'The Blue Hour Diner',
      district: 'Breakwater',
      areaId: 'LL-CITY-N008',
      kind: 'restaurant',
      access: 'enterable_dining_venue',
    },
    {
      id: 'LL-CITY-LOC019',
      name: 'Guildbank Social Cafe',
      district: 'Glassward',
      areaId: 'LL-CITY-N029',
      kind: 'restaurant',
      access: 'enterable_social_cafe_no_direct_food_purchase',
    },
    {
      id: 'LL-CITY-LOC020',
      name: 'Copper Table Restaurant',
      district: 'Glassward',
      areaId: 'LL-CITY-N054',
      kind: 'restaurant',
      access: 'story_cutscene_space; ordinary_entry_unverified',
    },
    {
      id: 'LL-CITY-LOC021',
      name: 'Southbank Pasta House',
      district: 'Glassward',
      areaId: 'LL-CITY-N052',
      kind: 'restaurant',
      access: 'advertised_dining_venue; ordinary_entry_and_social_eligibility_unverified',
    },
    {
      id: 'LL-CITY-LOC022',
      name: 'Quay House',
      district: 'Breakwater',
      areaId: 'LL-CITY-N008',
      kind: 'bar_or_social_cafe',
      access: 'social_drinking_and_story_space',
    },
    {
      id: 'LL-CITY-LOC023',
      name: 'Bellhaven Garden',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N019',
      kind: 'bar_or_social_cafe',
      access: 'pub_with_playable_darts',
    },
    {
      id: 'LL-CITY-LOC024',
      name: 'Reservoir Club',
      district: 'Glassward',
      areaId: 'LL-CITY-N034',
      kind: 'bar_or_social_cafe',
      access: 'social_drinking_destination; ordinary_interior_unverified',
    },
    {
      id: 'LL-CITY-LOC025',
      name: 'Spire Lounge',
      district: 'Glassward',
      areaId: 'LL-CITY-N038',
      kind: 'bar_or_social_cafe',
      access: 'social_drinking_destination; ordinary_interior_unverified',
    },
    {
      id: 'LL-CITY-LOC026',
      name: 'Lowlight Taproom',
      district: 'Glassward',
      areaId: 'LL-CITY-N042',
      kind: 'bar_or_social_cafe',
      access: 'pub_with_playable_darts',
    },
    {
      id: 'LL-CITY-LOC027',
      name: 'Anchor Rooms',
      district: 'Breakwater',
      areaId: 'LL-CITY-N003',
      kind: 'bar_or_social_cafe',
      access: 'enterable_pool_venue',
    },
    {
      id: 'LL-CITY-LOC028',
      name: 'Quay Cabaret',
      district: 'Breakwater',
      areaId: 'LL-CITY-N008',
      kind: 'activity_venue',
      access: 'enterable_performance_venue',
    },
    {
      id: 'LL-CITY-LOC029',
      name: 'Anchor Stage',
      district: 'Glassward',
      areaId: 'LL-CITY-N043',
      kind: 'activity_venue',
      access: 'enterable_performance_venue',
    },
    {
      id: 'LL-CITY-LOC030',
      name: 'Furnace Revue',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N063',
      kind: 'activity_venue',
      access: 'enterable_adult_venue',
    },
    {
      id: 'LL-CITY-LOC031',
      name: 'Tidal Revue',
      district: 'The Narrows',
      areaId: 'LL-CITY-N026',
      kind: 'activity_venue',
      access: 'enterable_adult_venue',
    },
    {
      id: 'LL-CITY-LOC032',
      name: 'Lantern Lanes',
      district: 'Breakwater',
      areaId: 'LL-CITY-N006',
      kind: 'activity_venue',
      access: 'enterable_activity_venue',
    },
    {
      id: 'LL-CITY-LOC033',
      name: 'Coldstore Lanes',
      district: 'Glassward',
      areaId: 'LL-CITY-N040',
      kind: 'activity_venue',
      access: 'enterable_activity_venue',
    },
    {
      id: 'LL-CITY-LOC034',
      name: 'Pier Goods — Old Quay',
      district: 'Breakwater',
      areaId: 'LL-CITY-N008',
      kind: 'apparel_store',
      access: 'enterable_retail',
    },
    {
      id: 'LL-CITY-LOC035',
      name: 'Foundry Thread — West Assembly',
      district: 'Glassward',
      areaId: 'LL-CITY-N033',
      kind: 'apparel_store',
      access: 'enterable_retail',
    },
    {
      id: 'LL-CITY-LOC036',
      name: 'Sable House — Orchard East',
      district: 'Glassward',
      areaId: 'LL-CITY-N031',
      kind: 'apparel_store',
      access: 'enterable_retail',
    },
    {
      id: 'LL-CITY-LOC037',
      name: 'Sable House — Bourse',
      district: 'Glassward',
      areaId: 'LL-CITY-N050',
      kind: 'apparel_store',
      access: 'enterable_retail',
    },
    {
      id: 'LL-CITY-LOC038',
      name: 'Harborlink — Orchard Rise',
      district: 'Breakwater',
      areaId: 'LL-CITY-N009',
      kind: 'computer_cafe',
      access: 'enterable_computer_service',
    },
    {
      id: 'LL-CITY-LOC039',
      name: 'Harborlink — West Assembly',
      district: 'Glassward',
      areaId: 'LL-CITY-N033',
      kind: 'computer_cafe',
      access: 'enterable_computer_service',
    },
    {
      id: 'LL-CITY-LOC040',
      name: 'Harborlink — Brickhaven',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N060',
      kind: 'computer_cafe',
      access: 'enterable_computer_service',
    },
    {
      id: 'LL-CITY-LOC041',
      name: 'Rook Supply — Dispatch',
      district: 'Breakwater',
      areaId: 'LL-CITY-N004',
      kind: 'weapon_store',
      access: 'enterable_equipment_service',
    },
    {
      id: 'LL-CITY-LOC042',
      name: 'Rook Supply — Lantern Market',
      district: 'Glassward',
      areaId: 'LL-CITY-N048',
      kind: 'weapon_store',
      access: 'enterable_equipment_service',
    },
    {
      id: 'LL-CITY-LOC043',
      name: 'Rook Supply — Freightgate',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N064',
      kind: 'weapon_store',
      access: 'enterable_equipment_service',
    },
    {
      id: 'LL-CITY-LOC044',
      name: 'Saira’s Service Bay',
      district: 'Breakwater',
      areaId: 'LL-CITY-N009',
      kind: 'repair_respray_bay',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC045',
      name: 'Lowlight Repairs',
      district: 'Glassward',
      areaId: 'LL-CITY-N042',
      kind: 'repair_respray_bay',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC046',
      name: 'Reservoir Motorworks',
      district: 'Glassward',
      areaId: 'LL-CITY-N034',
      kind: 'repair_respray_bay',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC047',
      name: 'North Foundry Auto Finish',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N058',
      kind: 'repair_respray_bay',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC048',
      name: 'Freightgate Auto Finish',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N064',
      kind: 'repair_respray_bay',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC049',
      name: 'Kiln Row Wash',
      district: 'Breakwater',
      areaId: 'LL-CITY-N003',
      kind: 'vehicle_wash',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC050',
      name: 'Flightpath Wash',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N020',
      kind: 'vehicle_wash',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC051',
      name: 'Lowlight Wash',
      district: 'Glassward',
      areaId: 'LL-CITY-N042',
      kind: 'vehicle_wash',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC052',
      name: 'Cliffside Wash',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N057',
      kind: 'vehicle_wash',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC053',
      name: 'Furnace Wash',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N063',
      kind: 'vehicle_wash',
      access: 'vehicle_service_bay',
    },
    {
      id: 'LL-CITY-LOC054',
      name: 'Dockside Rooms',
      district: 'Breakwater',
      areaId: 'LL-CITY-N008',
      kind: 'safehouse',
      access: 'story_gated_safehouse',
    },
    {
      id: 'LL-CITY-LOC055',
      name: 'Canal Refuge',
      district: 'The Narrows',
      areaId: 'LL-CITY-N027',
      kind: 'safehouse',
      access: 'story_gated_safehouse',
    },
    {
      id: 'LL-CITY-LOC056',
      name: 'Glassward Flat',
      district: 'Glassward',
      areaId: 'LL-CITY-N031',
      kind: 'safehouse',
      access: 'story_gated_safehouse',
    },
    {
      id: 'LL-CITY-LOC057',
      name: 'Ironhaven Workshop',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'safehouse',
      access: 'story_gated_safehouse',
    },
    {
      id: 'LL-CITY-LOC058',
      name: 'Skyline Lease',
      district: 'Glassward',
      areaId: 'LL-CITY-N034',
      kind: 'safehouse',
      access: 'story_gated_safehouse',
    },
    {
      id: 'LL-CITY-LOC059',
      name: 'Old Quay Precinct',
      district: 'Breakwater',
      areaId: 'LL-CITY-N008',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC060',
      name: 'Rainstep Precinct',
      district: 'Breakwater',
      areaId: 'LL-CITY-N012',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC061',
      name: 'Foundry Reach Precinct',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N015',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC062',
      name: 'Airfield Security Precinct',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N016',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC063',
      name: 'Foundry Steps Precinct',
      district: 'The Narrows',
      areaId: 'LL-CITY-N023',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC064',
      name: 'Longcourt Precinct',
      district: 'The Narrows',
      areaId: 'LL-CITY-N026',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC065',
      name: 'East Assembly Precinct',
      district: 'Glassward',
      areaId: 'LL-CITY-N028',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC066',
      name: 'Harbor Response Headquarters',
      district: 'Glassward',
      areaId: 'LL-CITY-N055',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC067',
      name: 'Orchard East Precinct',
      district: 'Glassward',
      areaId: 'LL-CITY-N031',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC068',
      name: 'Arts Quarter Precinct',
      district: 'Glassward',
      areaId: 'LL-CITY-N056',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC069',
      name: 'Neon Cross Precinct',
      district: 'Glassward',
      areaId: 'LL-CITY-N043',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC070',
      name: 'Scholar Heights Precinct',
      district: 'Glassward',
      areaId: 'LL-CITY-N035',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC071',
      name: 'River Quarter Precinct',
      district: 'Glassward',
      areaId: 'LL-CITY-N045',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC072',
      name: 'Reactor Basin Precinct',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N065',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC073',
      name: 'Forge Ward Precinct',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N061',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC074',
      name: 'North Foundry Precinct',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N058',
      kind: 'police_site',
      access: 'exterior_service_site; source_interior_inaccessible',
    },
    {
      id: 'LL-CITY-LOC075',
      name: 'Signal Hill Firehouse',
      district: 'Breakwater',
      areaId: 'LL-CITY-N010',
      kind: 'firehouse',
      access: 'exterior_emergency_service_site',
    },
    {
      id: 'LL-CITY-LOC076',
      name: 'Airfield Firehouse',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N016',
      kind: 'firehouse',
      access: 'exterior_emergency_service_site',
    },
    {
      id: 'LL-CITY-LOC077',
      name: 'Longcourt Firehouse',
      district: 'The Narrows',
      areaId: 'LL-CITY-N026',
      kind: 'firehouse',
      access: 'exterior_emergency_service_site',
    },
    {
      id: 'LL-CITY-LOC078',
      name: 'Reservoir Firehouse',
      district: 'Glassward',
      areaId: 'LL-CITY-N034',
      kind: 'firehouse',
      access: 'exterior_emergency_service_site',
    },
    {
      id: 'LL-CITY-LOC079',
      name: 'River Quarter Firehouse',
      district: 'Glassward',
      areaId: 'LL-CITY-N045',
      kind: 'firehouse',
      access: 'exterior_emergency_service_site',
    },
    {
      id: 'LL-CITY-LOC080',
      name: 'Southbank Firehouse',
      district: 'Glassward',
      areaId: 'LL-CITY-N052',
      kind: 'firehouse',
      access: 'exterior_emergency_service_site',
    },
    {
      id: 'LL-CITY-LOC081',
      name: 'Brickhaven Firehouse',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N060',
      kind: 'firehouse',
      access: 'exterior_emergency_service_site',
    },
    {
      id: 'LL-CITY-LOC082',
      name: 'Furnace Firehouse',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N063',
      kind: 'firehouse',
      access: 'exterior_emergency_service_site',
    },
    {
      id: 'LL-CITY-LOC083',
      name: 'Founders Medical Center',
      district: 'Breakwater',
      areaId: 'LL-CITY-N011',
      kind: 'hospital_or_clinic',
      access: 'enterable_hospital',
    },
    {
      id: 'LL-CITY-LOC084',
      name: 'Brigid Medical Center',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N013',
      kind: 'hospital_or_clinic',
      access: 'medical_site_no_verified_public_interior',
    },
    {
      id: 'LL-CITY-LOC085',
      name: 'Longcourt Medical Center',
      district: 'The Narrows',
      areaId: 'LL-CITY-N026',
      kind: 'hospital_or_clinic',
      access: 'medical_recovery_site_no_verified_public_interior',
    },
    {
      id: 'LL-CITY-LOC086',
      name: 'Civic Emergency Center',
      district: 'Glassward',
      areaId: 'LL-CITY-N049',
      kind: 'hospital_or_clinic',
      access: 'medical_site_no_verified_public_interior',
    },
    {
      id: 'LL-CITY-LOC087',
      name: 'Assembly Hospital',
      district: 'Glassward',
      areaId: 'LL-CITY-N033',
      kind: 'hospital_or_clinic',
      access: 'inaccessible_interior_accessible_roof',
    },
    {
      id: 'LL-CITY-LOC088',
      name: 'Ledger East Hospital',
      district: 'Glassward',
      areaId: 'LL-CITY-N039',
      kind: 'hospital_or_clinic',
      access: 'inaccessible_interior_medical_site',
    },
    {
      id: 'LL-CITY-LOC089',
      name: 'Forge Medical Center',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N061',
      kind: 'hospital_or_clinic',
      access: 'medical_recovery_site_no_verified_public_interior',
    },
    {
      id: 'LL-CITY-LOC090',
      name: 'North Foundry Hospital',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N058',
      kind: 'hospital_or_clinic',
      access: 'enterable_hospital',
    },
    {
      id: 'LL-CITY-LOC091',
      name: 'Beacon Clinic Ruins',
      district: 'Glassward',
      areaId: 'LL-CITY-N036',
      kind: 'hospital_or_clinic',
      access: 'enterable_derelict_mission_space',
    },
    {
      id: 'LL-CITY-LOC092',
      name: 'Grand Union Terminal',
      district: 'Glassward',
      areaId: 'LL-CITY-N037',
      kind: 'terminal_landmark',
      access: 'inaccessible_landmark_hosting_accessible_subway',
    },
    {
      id: 'LL-CITY-LOC093',
      name: 'Spire of Tides',
      district: 'Glassward',
      areaId: 'LL-CITY-N044',
      kind: 'skyline_landmark',
      access: 'landmark_exterior; exact_source_roof_access_audit_pending',
    },
    {
      id: 'LL-CITY-LOC094',
      name: 'Three Corners Building',
      district: 'Glassward',
      areaId: 'LL-CITY-N044',
      kind: 'architectural_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC095',
      name: 'Harbor Relief Hall',
      district: 'Glassward',
      areaId: 'LL-CITY-N049',
      kind: 'civic_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC096',
      name: 'Common Water Assembly',
      district: 'Glassward',
      areaId: 'LL-CITY-N038',
      kind: 'civic_landmark',
      access: 'exterior_complex',
    },
    {
      id: 'LL-CITY-LOC097',
      name: 'Tideglass Tower',
      district: 'Glassward',
      areaId: 'LL-CITY-N039',
      kind: 'skyline_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC098',
      name: 'Spire Gardens Tower',
      district: 'Glassward',
      areaId: 'LL-CITY-N038',
      kind: 'skyline_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC099',
      name: 'Union Crown',
      district: 'Glassward',
      areaId: 'LL-CITY-N037',
      kind: 'skyline_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC100',
      name: 'Foundry Signal Tower',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N015',
      kind: 'skyline_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC101',
      name: 'Foundry Arts Union',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N015',
      kind: 'arts_landmark',
      access: 'exterior_landmark; interior_audit_pending',
    },
    {
      id: 'LL-CITY-LOC102',
      name: 'Worlds Garden Pavilions',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N018',
      kind: 'park_landmark',
      access: 'outdoor_architectural_site',
    },
    {
      id: 'LL-CITY-LOC103',
      name: 'Tide Orrery',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N018',
      kind: 'public_art_landmark',
      access: 'outdoor_sculpture',
    },
    {
      id: 'LL-CITY-LOC104',
      name: 'Harbor Collegium',
      district: 'Glassward',
      areaId: 'LL-CITY-N035',
      kind: 'university_campus',
      access: 'outdoor_campus; individual_interior_audit_pending',
    },
    {
      id: 'LL-CITY-LOC105',
      name: 'Spire Chapel',
      district: 'Glassward',
      areaId: 'LL-CITY-N038',
      kind: 'religious_landmark',
      access: 'exterior_landmark; interior_audit_pending',
    },
    {
      id: 'LL-CITY-LOC106',
      name: 'Arts Quarter Chapel',
      district: 'Glassward',
      areaId: 'LL-CITY-N056',
      kind: 'religious_landmark',
      access: 'exterior_landmark; interior_audit_pending',
    },
    {
      id: 'LL-CITY-LOC107',
      name: 'Lantern Memorial',
      district: 'Glassward',
      areaId: 'LL-CITY-N053',
      kind: 'tourist_monument',
      access: 'outdoor_landmark_with_lobby_and_hidden_chamber',
    },
    {
      id: 'LL-CITY-LOC108',
      name: 'Beacon Island Light',
      district: 'Glassward',
      areaId: 'LL-CITY-N036',
      kind: 'lighthouse',
      access: 'outdoor_landmark; exact_interior_audit_pending',
    },
    {
      id: 'LL-CITY-LOC109',
      name: 'Brigid Ballpark',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N018',
      kind: 'sports_landmark',
      access: 'exterior_sports_site',
    },
    {
      id: 'LL-CITY-LOC110',
      name: 'Bellhaven Memorial Grounds',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N019',
      kind: 'cemetery',
      access: 'outdoor_activity_and_story_site',
    },
    {
      id: 'LL-CITY-LOC111',
      name: 'Lantern Market Court',
      district: 'Glassward',
      areaId: 'LL-CITY-N048',
      kind: 'civic_plaza',
      access: 'outdoor_plaza',
    },
    {
      id: 'LL-CITY-LOC112',
      name: 'Founders Memorial Steps',
      district: 'Breakwater',
      areaId: 'LL-CITY-N009',
      kind: 'park_entrance_monument',
      access: 'outdoor_landmark',
    },
    {
      id: 'LL-CITY-LOC113',
      name: 'Founders Arch',
      district: 'Breakwater',
      areaId: 'LL-CITY-N011',
      kind: 'architectural_landmark',
      access: 'outdoor_landmark',
    },
    {
      id: 'LL-CITY-LOC114',
      name: 'Civic Orchard Time Pillar',
      district: 'Glassward',
      areaId: 'LL-CITY-N030',
      kind: 'public_memorial',
      access: 'outdoor_park_monument',
    },
    {
      id: 'LL-CITY-LOC115',
      name: 'Ironhaven Civic Tower',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'skyline_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC116',
      name: 'Ironhaven Devices Building',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'office_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC117',
      name: 'Ironhaven Energy Building',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'office_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC118',
      name: 'Brickhaven Commerce House',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'bank_office_landmark',
      access: 'exterior_landmark',
    },
    {
      id: 'LL-CITY-LOC119',
      name: 'Ironwater Finance House',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'financial_landmark',
      access: 'inaccessible_office_landmark',
    },
    {
      id: 'LL-CITY-LOC120',
      name: 'Civic Orchard Grounds',
      district: 'Glassward',
      areaId: 'LL-CITY-N030',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC121',
      name: 'Orchard Rise Park',
      district: 'Breakwater',
      areaId: 'LL-CITY-N009',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC122',
      name: 'Northwater Commons',
      district: 'The Narrows',
      areaId: 'LL-CITY-N021',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC123',
      name: 'Worlds Garden Grounds',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N018',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC124',
      name: 'Foundry Reach Gardens',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N015',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC125',
      name: 'Bellhaven Gantry Park',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N019',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC126',
      name: 'Bellhaven Common',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N019',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC127',
      name: 'South Lantern Gardens',
      district: 'Glassward',
      areaId: 'LL-CITY-N047',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC128',
      name: 'Seawall Gardens',
      district: 'Glassward',
      areaId: 'LL-CITY-N046',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC129',
      name: 'Forge Ward Common',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N061',
      kind: 'park',
      access: 'outdoor_public_space',
    },
    {
      id: 'LL-CITY-LOC130',
      name: 'Lantern Promenade',
      district: 'Breakwater',
      areaId: 'LL-CITY-N006',
      kind: 'boardwalk',
      access: 'outdoor_walk',
    },
    {
      id: 'LL-CITY-LOC131',
      name: 'Lantern Fairground',
      district: 'Breakwater',
      areaId: 'LL-CITY-N006',
      kind: 'amusement_landmark',
      access: 'outdoor_site_rides_nonfunctional_in_source',
    },
    {
      id: 'LL-CITY-LOC132',
      name: 'The Windlass',
      district: 'Breakwater',
      areaId: 'LL-CITY-N006',
      kind: 'amusement_structure',
      access: 'nonrideable_landmark',
    },
    {
      id: 'LL-CITY-LOC133',
      name: 'Lantern Wheel',
      district: 'Breakwater',
      areaId: 'LL-CITY-N006',
      kind: 'amusement_structure',
      access: 'nonrideable_observation_wheel_landmark',
    },
    {
      id: 'LL-CITY-LOC134',
      name: 'Coldstore Pier',
      district: 'Glassward',
      areaId: 'LL-CITY-N040',
      kind: 'sports_leisure_pier',
      access: 'outdoor_leisure_complex',
    },
    {
      id: 'LL-CITY-LOC135',
      name: 'Coldstore Practice Grounds',
      district: 'Glassward',
      areaId: 'LL-CITY-N040',
      kind: 'sports_site',
      access: 'source_base_scenery; playable_golf_is_episodic',
    },
    {
      id: 'LL-CITY-LOC136',
      name: 'Southbank Pier',
      district: 'Glassward',
      areaId: 'LL-CITY-N052',
      kind: 'public_pier',
      access: 'outdoor_mission_and_service_space',
    },
    {
      id: 'LL-CITY-LOC137',
      name: 'Pier Eight Yard',
      district: 'Breakwater',
      areaId: 'LL-CITY-N005',
      kind: 'cargo_port',
      access: 'outdoor_industrial_space',
    },
    {
      id: 'LL-CITY-LOC138',
      name: 'Relief Carrier',
      district: 'Breakwater',
      areaId: 'LL-CITY-N005',
      kind: 'cargo_ship',
      access: 'story_cutscene_and_mission_vessel; access_gated',
    },
    {
      id: 'LL-CITY-LOC139',
      name: 'Pump Island Boatyard',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N014',
      kind: 'boatyard',
      access: 'outdoor_and_warehouse_mission_space',
    },
    {
      id: 'LL-CITY-LOC140',
      name: 'Pump Island Waterworks',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N014',
      kind: 'utility_plant',
      access: 'outdoor_industrial_space',
    },
    {
      id: 'LL-CITY-LOC141',
      name: 'Freightgate Port Authority',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N064',
      kind: 'port_facility',
      access: 'port_authority_headquarters_and_industrial_site; exact_interior_audit_pending',
    },
    {
      id: 'LL-CITY-LOC142',
      name: 'Ironwater Ferry Terminal',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'ferry_landmark',
      access: 'finished_terminal_ferry_service_not_functional',
    },
    {
      id: 'LL-CITY-LOC143',
      name: 'Seawall Ferry Works',
      district: 'Glassward',
      areaId: 'LL-CITY-N046',
      kind: 'unfinished_ferry_site',
      access: 'unfinished_terminal_no_regular_ferry_service',
    },
    {
      id: 'LL-CITY-LOC144',
      name: 'Ironhaven Vista Pad',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'heliport',
      access: 'outdoor_aircraft_site',
    },
    {
      id: 'LL-CITY-LOC145',
      name: 'Southbank Vista Tours',
      district: 'Glassward',
      areaId: 'LL-CITY-N052',
      kind: 'tour_heliport',
      access: 'public_aerial_tour_service',
    },
    {
      id: 'LL-CITY-LOC146',
      name: 'River Quarter Landing',
      district: 'Glassward',
      areaId: 'LL-CITY-N045',
      kind: 'helipad',
      access: 'outdoor_aircraft_site',
    },
    {
      id: 'LL-CITY-LOC147',
      name: 'Harbor Airfield Campus',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N016',
      kind: 'airport',
      access: 'outdoor_airport_and_controlled_airside',
    },
    {
      id: 'LL-CITY-LOC148',
      name: 'Harbor Airfield Terminal',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N016',
      kind: 'airport_terminal',
      access: 'public_approach_and_subway_access; main_interior_audit_pending',
    },
    {
      id: 'LL-CITY-LOC149',
      name: 'Harbor Airfield Rotor Yard',
      district: 'Saint Brigid',
      areaId: 'LL-CITY-N016',
      kind: 'airport_heliport',
      access: 'outdoor_aircraft_site',
    },
    {
      id: 'LL-CITY-LOC150',
      name: 'Ironhaven Custody Complex',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N065',
      kind: 'prison',
      access: 'secured_exterior_facility; internal_access_audit_pending',
    },
    {
      id: 'LL-CITY-LOC151',
      name: 'Harbor History Gallery',
      district: 'Glassward',
      areaId: 'LL-CITY-N030',
      kind: 'museum',
      access: 'mission_and_public_museum_access_needs_individual_audit',
    },
    {
      id: 'LL-CITY-LOC152',
      name: 'Morrow Bell Legal',
      district: 'Glassward',
      areaId: 'LL-CITY-N050',
      kind: 'law_office',
      access: 'public_lobby_mission_gated_offices',
    },
    {
      id: 'LL-CITY-LOC153',
      name: 'Nightglass Hotel',
      district: 'Glassward',
      areaId: 'LL-CITY-N043',
      kind: 'hotel',
      access: 'public_lobby_mission_upper_rooms_roof_entry',
    },
    {
      id: 'LL-CITY-LOC154',
      name: 'Union Credit Hall',
      district: 'Glassward',
      areaId: 'LL-CITY-N048',
      kind: 'bank',
      access: 'mission_only_bank_interior',
    },
    {
      id: 'LL-CITY-LOC155',
      name: 'Ironhaven Night Market Hall',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'restaurant_mission_space',
      access: 'social_destination_mission_interior_multiplayer_interior',
    },
    {
      id: 'LL-CITY-LOC156',
      name: 'Cliffside Pavilion Ruins',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N057',
      kind: 'abandoned_casino',
      access: 'enterable_ruin_and_finale_space',
    },
    {
      id: 'LL-CITY-LOC157',
      name: 'Furnace Bottling Works',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N063',
      kind: 'abandoned_factory',
      access: 'enterable_industrial_ruin',
    },
    {
      id: 'LL-CITY-LOC158',
      name: 'Canal Bottling Store',
      district: 'The Narrows',
      areaId: 'LL-CITY-N022',
      kind: 'warehouse',
      access: 'enterable_warehouse_candidate',
    },
    {
      id: 'LL-CITY-LOC159',
      name: 'Dry Basin Gasworks',
      district: 'The Narrows',
      areaId: 'LL-CITY-N024',
      kind: 'warehouse',
      access: 'enterable_industrial_mission_space',
    },
    {
      id: 'LL-CITY-LOC160',
      name: 'Beacon Works Shed',
      district: 'Glassward',
      areaId: 'LL-CITY-N036',
      kind: 'construction_warehouse',
      access: 'enterable_construction_space',
    },
    {
      id: 'LL-CITY-LOC161',
      name: 'Voss Dispatch Depot',
      district: 'Breakwater',
      areaId: 'LL-CITY-N004',
      kind: 'taxi_depot',
      access: 'story_office_vehicle_depot; interior_access_audit_pending',
    },
    {
      id: 'LL-CITY-LOC162',
      name: 'Vector Garage',
      district: 'Breakwater',
      areaId: 'LL-CITY-N005',
      kind: 'vehicle_workshop',
      access: 'story_garage_acquisition_service; ordinary_access_audit_pending',
    },
    {
      id: 'LL-CITY-LOC163',
      name: 'Canal Collector Yard',
      district: 'The Narrows',
      areaId: 'LL-CITY-N022',
      kind: 'vehicle_collector',
      access: 'vehicle_delivery_and_sale_service',
    },
    {
      id: 'LL-CITY-LOC164',
      name: 'Ironhaven Motor Hall',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'vehicle_showroom',
      access: 'enterable_vehicle_display_candidate',
    },
    {
      id: 'LL-CITY-LOC165',
      name: 'Aster Display House',
      district: 'Glassward',
      areaId: 'LL-CITY-N031',
      kind: 'vehicle_showroom',
      access: 'enterable_vehicle_display_candidate',
    },
    {
      id: 'LL-CITY-LOC166',
      name: 'Saltgate Estate',
      district: 'Breakwater',
      areaId: 'LL-CITY-N002',
      kind: 'story_residence',
      access: 'story_scene_and_property; ordinary_access_audit_pending',
    },
    {
      id: 'LL-CITY-LOC167',
      name: 'Canal Broker Apartment',
      district: 'The Narrows',
      areaId: 'LL-CITY-N027',
      kind: 'story_apartment',
      access: 'story_mission_interior; access_audit_pending',
    },
    {
      id: 'LL-CITY-LOC168',
      name: 'Reservoir Second-Chance Flat',
      district: 'Glassward',
      areaId: 'LL-CITY-N034',
      kind: 'story_apartment',
      access: 'story_social_residence; access_audit_pending',
    },
    {
      id: 'LL-CITY-LOC169',
      name: 'Guildbank Records Flat',
      district: 'Glassward',
      areaId: 'LL-CITY-N029',
      kind: 'investigation_apartment',
      access: 'mission_apartment_with_computer',
    },
    {
      id: 'LL-CITY-LOC170',
      name: 'Cliffside Contractor House',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N057',
      kind: 'story_residence',
      access: 'story_scene_and_property; ordinary_access_audit_pending',
    },
    {
      id: 'LL-CITY-LOC171',
      name: 'Cliffside Abandoned House',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N057',
      kind: 'abandoned_house',
      access: 'outdoor_property_and_hidden_vehicle; interior_audit_pending',
    },
    {
      id: 'LL-CITY-LOC172',
      name: 'North Foundry Civic House',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N058',
      kind: 'story_residence',
      access: 'story_pickup_and_later_street_encounter',
    },
    {
      id: 'LL-CITY-LOC173',
      name: 'Signal Hill Visitor Flat',
      district: 'Breakwater',
      areaId: 'LL-CITY-N010',
      kind: 'story_apartment',
      access: 'mission_apartment_candidate',
    },
    {
      id: 'LL-CITY-LOC174',
      name: 'Kiln Row Runner Flat',
      district: 'Breakwater',
      areaId: 'LL-CITY-N003',
      kind: 'story_apartment',
      access: 'mission_apartment_candidate',
    },
    {
      id: 'LL-CITY-LOC175',
      name: 'Canal Supply Flat',
      district: 'The Narrows',
      areaId: 'LL-CITY-N027',
      kind: 'mission_apartment',
      access: 'mission_apartment_candidate',
    },
    {
      id: 'LL-CITY-LOC176',
      name: 'Tidal Derelict House',
      district: 'The Narrows',
      areaId: 'LL-CITY-N025',
      kind: 'abandoned_building',
      access: 'enterable_building_candidate',
    },
    {
      id: 'LL-CITY-LOC177',
      name: 'Canal Tenement Stair',
      district: 'The Narrows',
      areaId: 'LL-CITY-N027',
      kind: 'tenement',
      access: 'enterable_stairwell_candidate',
    },
    {
      id: 'LL-CITY-LOC178',
      name: 'Ironhaven Rising Frame',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'construction_tower',
      access: 'outdoor_vertical_construction_space',
    },
    {
      id: 'LL-CITY-LOC179',
      name: 'Dry Basin Construction Yard',
      district: 'The Narrows',
      areaId: 'LL-CITY-N024',
      kind: 'construction_site',
      access: 'outdoor_construction_space',
    },
    {
      id: 'LL-CITY-LOC180',
      name: 'Canal Refuge Works',
      district: 'The Narrows',
      areaId: 'LL-CITY-N027',
      kind: 'construction_site',
      access: 'outdoor_construction_space',
    },
    {
      id: 'LL-CITY-LOC181',
      name: 'Old Quay Works',
      district: 'Breakwater',
      areaId: 'LL-CITY-N008',
      kind: 'construction_site',
      access: 'outdoor_construction_space',
    },
    {
      id: 'LL-CITY-LOC182',
      name: 'Three Corners Social Cafe',
      district: 'Glassward',
      areaId: 'LL-CITY-N044',
      kind: 'restaurant',
      access: 'enterable_social_cafe_no_direct_food_purchase',
    },
    {
      id: 'LL-CITY-LOC183',
      name: 'Stacklight at Anchor Rooms',
      district: 'Breakwater',
      areaId: 'LL-CITY-N003',
      kind: 'arcade_cabinet',
      access: 'playable_cabinet_inside_parent_venue',
    },
    {
      id: 'LL-CITY-LOC184',
      name: 'Stacklight at Quay Cabaret',
      district: 'Breakwater',
      areaId: 'LL-CITY-N008',
      kind: 'arcade_cabinet',
      access: 'playable_cabinet_inside_parent_venue',
    },
    {
      id: 'LL-CITY-LOC185',
      name: 'Stacklight at Foundry Thread',
      district: 'Glassward',
      areaId: 'LL-CITY-N033',
      kind: 'arcade_cabinet',
      access: 'playable_cabinet_inside_parent_venue',
    },
    {
      id: 'LL-CITY-LOC186',
      name: 'Stacklight at Tidal Revue',
      district: 'The Narrows',
      areaId: 'LL-CITY-N026',
      kind: 'arcade_cabinet',
      access: 'playable_cabinet_inside_parent_venue',
    },
    {
      id: 'LL-CITY-LOC187',
      name: 'Stacklight community-stage prop',
      district: 'The Narrows',
      areaId: 'LL-CITY-N027',
      kind: 'arcade_prop',
      access: 'cutscene_only_inaccessible_cabinet',
    },
    {
      id: 'LL-CITY-LOC188',
      name: 'Ledger East Skyline Terminal',
      district: 'Glassward',
      areaId: 'LL-CITY-N039',
      kind: 'gondola_terminal',
      access: 'operating_passenger_terminal',
    },
    {
      id: 'LL-CITY-LOC189',
      name: 'Beacon Skyline Terminal',
      district: 'Glassward',
      areaId: 'LL-CITY-N036',
      kind: 'gondola_terminal',
      access: 'operating_passenger_terminal',
    },
    {
      id: 'LL-CITY-LOC190',
      name: 'Ironwater Investments House',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'financial_landmark',
      access: 'exterior_financial_landmark',
    },
    {
      id: 'LL-CITY-LOC191',
      name: 'Lantern Miniature Grounds',
      district: 'Breakwater',
      areaId: 'LL-CITY-N006',
      kind: 'miniature_golf_scenery',
      access: 'accessible_scenery_course_no_verified_base_playable_minigame',
    },
    {
      id: 'LL-CITY-LOC192',
      name: 'Orchard Rise Civic Memorial',
      district: 'Breakwater',
      areaId: 'LL-CITY-N009',
      kind: 'public_memorial',
      access: 'outdoor_monument',
    },
    {
      id: 'LL-CITY-LOC193',
      name: 'Ironwater Launch Quay',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N059',
      kind: 'mission_departure_dock',
      access: 'outdoor_boat_departure_and_mission_site',
    },
    {
      id: 'LL-CITY-LOC194',
      name: 'Anchor Reach Shipyards',
      district: 'Ironhaven',
      areaId: 'LL-CITY-N062',
      kind: 'industrial_waterfront',
      access: 'outdoor_dockland; exact_individual_sites_unresolved',
    },
  ],
  stations: [
    {
      id: 'LL-CITY-ST01',
      name: 'Boardwalk',
      areaId: 'LL-CITY-N008',
      vertical: 'elevated',
    },
    {
      id: 'LL-CITY-ST02',
      name: 'Dockworks',
      areaId: 'LL-CITY-N012',
      vertical: 'elevated',
    },
    {
      id: 'LL-CITY-ST03',
      name: 'Air Cargo',
      areaId: 'LL-CITY-N016',
      vertical: 'elevated',
    },
    {
      id: 'LL-CITY-ST04',
      name: 'Brigid Market',
      areaId: 'LL-CITY-N013',
      vertical: 'elevated',
    },
    {
      id: 'LL-CITY-ST05',
      name: 'Church Steps',
      areaId: 'LL-CITY-N017',
      vertical: 'elevated',
    },
    {
      id: 'LL-CITY-ST06',
      name: 'Canal South',
      areaId: 'LL-CITY-N023',
      vertical: 'elevated',
    },
    {
      id: 'LL-CITY-ST07',
      name: 'Canal North',
      areaId: 'LL-CITY-N022',
      vertical: 'elevated',
    },
    {
      id: 'LL-CITY-ST08',
      name: 'Seawall',
      areaId: 'LL-CITY-N047',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST09',
      name: 'Civic Hall',
      areaId: 'LL-CITY-N049',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST10',
      name: 'Orchard East',
      areaId: 'LL-CITY-N031',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST11',
      name: 'Glassward Central',
      areaId: 'LL-CITY-N037',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST12',
      name: 'Jade Square',
      areaId: 'LL-CITY-N055',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST13',
      name: 'Founders Row',
      areaId: 'LL-CITY-N056',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST14',
      name: 'Mill Avenue',
      areaId: 'LL-CITY-N043',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST15',
      name: 'Upper Exchange',
      areaId: 'LL-CITY-N034',
      vertical: 'elevated',
    },
    {
      id: 'LL-CITY-ST16',
      name: 'Lower Exchange',
      areaId: 'LL-CITY-N033',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST17',
      name: 'Orchard West Metro',
      areaId: 'LL-CITY-N032',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST18',
      name: 'Shipwright',
      areaId: 'LL-CITY-N040',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST19',
      name: 'East Assembly',
      areaId: 'LL-CITY-N038',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST20',
      name: 'West Assembly',
      areaId: 'LL-CITY-N042',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST21',
      name: 'Orchard North',
      areaId: 'LL-CITY-N030',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST22',
      name: 'Lighthouse East',
      areaId: 'LL-CITY-N029',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST23',
      name: 'Lighthouse West',
      areaId: 'LL-CITY-N032',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST24',
      name: 'Arts Quarter',
      areaId: 'LL-CITY-N056',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST25',
      name: 'Reservoir',
      areaId: 'LL-CITY-N033',
      vertical: 'underground',
    },
    {
      id: 'LL-CITY-ST26',
      name: 'Circus Yard',
      areaId: 'LL-CITY-N034',
      vertical: 'underground',
    },
  ],
  segments: [
    {
      id: 'LL-CITY-ROUTE-A',
      name: 'G1 Outer South',
      calls: [
        {
          stationId: 'LL-CITY-ST11',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST12',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST08',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST13',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST18',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST20',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST23',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST25',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST26',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST22',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST19',
          role: 'assigned_route_platform',
        },
      ],
      nextSegmentId: 'LL-CITY-ROUTE-8',
      boundaryStationId: 'LL-CITY-ST19',
    },
    {
      id: 'LL-CITY-ROUTE-8',
      name: 'G1 Port and Airfield',
      calls: [
        {
          stationId: 'LL-CITY-ST04',
          role: 'lower',
        },
        {
          stationId: 'LL-CITY-ST05',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST03',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST04',
          role: 'upper',
        },
        {
          stationId: 'LL-CITY-ST02',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST01',
          role: 'assigned_route_platform',
        },
      ],
      nextSegmentId: 'LL-CITY-ROUTE-A',
      boundaryStationId: 'LL-CITY-ST11',
    },
    {
      id: 'LL-CITY-ROUTE-J',
      name: 'G2 Outer North',
      calls: [
        {
          stationId: 'LL-CITY-ST19',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST22',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST26',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST25',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST23',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST20',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST18',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST13',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST08',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST12',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST11',
          role: 'assigned_route_platform',
        },
      ],
      nextSegmentId: 'LL-CITY-ROUTE-3',
      boundaryStationId: 'LL-CITY-ST11',
    },
    {
      id: 'LL-CITY-ROUTE-3',
      name: 'G2 Airfield and Port',
      calls: [
        {
          stationId: 'LL-CITY-ST01',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST02',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST04',
          role: 'upper',
        },
        {
          stationId: 'LL-CITY-ST03',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST05',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST04',
          role: 'lower',
        },
      ],
      nextSegmentId: 'LL-CITY-ROUTE-J',
      boundaryStationId: 'LL-CITY-ST19',
    },
    {
      id: 'LL-CITY-ROUTE-K',
      name: 'C1 Civic Clockwise',
      calls: [
        {
          stationId: 'LL-CITY-ST15',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST21',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST10',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST11',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST09',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST24',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST14',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST17',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST16',
          role: 'assigned_route_platform',
        },
      ],
      nextSegmentId: 'LL-CITY-ROUTE-E',
      boundaryStationId: 'LL-CITY-ST16',
    },
    {
      id: 'LL-CITY-ROUTE-E',
      name: 'C1 Canal Return',
      calls: [
        {
          stationId: 'LL-CITY-ST07',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST06',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST15',
          role: 'assigned_route_platform',
        },
      ],
      nextSegmentId: 'LL-CITY-ROUTE-K',
      boundaryStationId: 'LL-CITY-ST15',
    },
    {
      id: 'LL-CITY-ROUTE-C',
      name: 'C2 Civic Counterclockwise',
      calls: [
        {
          stationId: 'LL-CITY-ST16',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST17',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST14',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST24',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST09',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST11',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST10',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST21',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST15',
          role: 'assigned_route_platform',
        },
      ],
      nextSegmentId: 'LL-CITY-ROUTE-B',
      boundaryStationId: 'LL-CITY-ST15',
    },
    {
      id: 'LL-CITY-ROUTE-B',
      name: 'C2 Canal Outbound',
      calls: [
        {
          stationId: 'LL-CITY-ST06',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST07',
          role: 'assigned_route_platform',
        },
        {
          stationId: 'LL-CITY-ST16',
          role: 'assigned_route_platform',
        },
      ],
      nextSegmentId: 'LL-CITY-ROUTE-C',
      boundaryStationId: 'LL-CITY-ST16',
    },
  ],
  services: [
    {
      id: 'LL-CITY-SERVICE-01',
      name: 'G1 Seaward Loop',
      segmentIds: ['LL-CITY-ROUTE-A', 'LL-CITY-ROUTE-8'],
      calls: [
        {
          stationId: 'LL-CITY-ST11',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST12',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST08',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST13',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST18',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST20',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST23',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST25',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST26',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST22',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST19',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST04',
          role: 'lower',
        },
        {
          stationId: 'LL-CITY-ST05',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST03',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST04',
          role: 'upper',
        },
        {
          stationId: 'LL-CITY-ST02',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST01',
          role: 'outer_line_platform',
        },
      ],
    },
    {
      id: 'LL-CITY-SERVICE-02',
      name: 'G2 Landward Loop',
      segmentIds: ['LL-CITY-ROUTE-J', 'LL-CITY-ROUTE-3'],
      calls: [
        {
          stationId: 'LL-CITY-ST11',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST01',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST02',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST04',
          role: 'upper',
        },
        {
          stationId: 'LL-CITY-ST03',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST05',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST04',
          role: 'lower',
        },
        {
          stationId: 'LL-CITY-ST19',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST22',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST26',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST25',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST23',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST20',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST18',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST13',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST08',
          role: 'outer_line_platform',
        },
        {
          stationId: 'LL-CITY-ST12',
          role: 'outer_line_platform',
        },
      ],
    },
    {
      id: 'LL-CITY-SERVICE-03',
      name: 'C1 Civic Canal Loop',
      segmentIds: ['LL-CITY-ROUTE-K', 'LL-CITY-ROUTE-E'],
      calls: [
        {
          stationId: 'LL-CITY-ST15',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST21',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST10',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST11',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST09',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST24',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST14',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST17',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST16',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST07',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST06',
          role: 'inner_line_platform',
        },
      ],
    },
    {
      id: 'LL-CITY-SERVICE-04',
      name: 'C2 Canal Civic Loop',
      segmentIds: ['LL-CITY-ROUTE-C', 'LL-CITY-ROUTE-B'],
      calls: [
        {
          stationId: 'LL-CITY-ST16',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST17',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST14',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST24',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST09',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST11',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST10',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST21',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST15',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST06',
          role: 'inner_line_platform',
        },
        {
          stationId: 'LL-CITY-ST07',
          role: 'inner_line_platform',
        },
      ],
    },
  ],
  crossings: [
    {
      id: 'LL-CITY-CROSS01',
      name: 'Quay Span',
      kind: 'road_pedestrian_bridge',
      areaIds: ['LL-CITY-N008', 'LL-CITY-N048'],
    },
    {
      id: 'LL-CITY-CROSS02',
      name: 'Beamway Crossing',
      kind: 'road_rail_pedestrian_bridge',
      areaIds: ['LL-CITY-N004', 'LL-CITY-N039'],
    },
    {
      id: 'LL-CITY-CROSS03',
      name: 'Pump Reach West',
      kind: 'road_bridge',
      areaIds: ['LL-CITY-N014', 'LL-CITY-N029'],
    },
    {
      id: 'LL-CITY-CROSS04',
      name: 'Pump Reach North',
      kind: 'road_bridge',
      areaIds: ['LL-CITY-N014', 'LL-CITY-N027'],
    },
    {
      id: 'LL-CITY-CROSS05',
      name: 'Pump Reach East',
      kind: 'road_bridge',
      areaIds: ['LL-CITY-N014', 'LL-CITY-N015'],
    },
    {
      id: 'LL-CITY-CROSS06',
      name: 'Brigid Bay Crossing',
      kind: 'road_toll_bridge',
      areaIds: ['LL-CITY-N019', 'LL-CITY-N024'],
    },
    {
      id: 'LL-CITY-CROSS07',
      name: 'Reservoir Road Span',
      kind: 'road_bridge',
      areaIds: ['LL-CITY-N034', 'LL-CITY-N021'],
    },
    {
      id: 'LL-CITY-CROSS08',
      name: 'Reservoir Rail Span',
      kind: 'rail_bridge',
      areaIds: ['LL-CITY-N034', 'LL-CITY-N027'],
    },
    {
      id: 'LL-CITY-CROSS09',
      name: 'Ironhaven Gateway',
      kind: 'road_bridge',
      areaIds: ['LL-CITY-N058', 'LL-CITY-N035'],
    },
    {
      id: 'LL-CITY-CROSS10',
      name: 'Beacon Crossing',
      kind: 'road_pedestrian_bridge',
      areaIds: ['LL-CITY-N036', 'LL-CITY-N041'],
    },
    {
      id: 'LL-CITY-CROSS11',
      name: 'Broken Forge Crossing',
      kind: 'derelict_crossing',
      areaIds: ['LL-CITY-N065', 'LL-CITY-N063'],
    },
    {
      id: 'LL-CITY-CROSS12',
      name: 'Dry Basin Extension',
      kind: 'unfinished_flyover',
      areaIds: ['LL-CITY-N024', 'LL-CITY-N022'],
    },
  ],
  arterials: [
    {
      id: 'LL-CITY-ROAD01',
      name: 'Foundry-Airfield Expressway',
      kind: 'expressway',
      areaId: 'LL-CITY-N015',
    },
    {
      id: 'LL-CITY-ROAD02',
      name: 'Breakwater Connector',
      kind: 'expressway',
      areaId: 'LL-CITY-N004',
    },
    {
      id: 'LL-CITY-ROAD03',
      name: 'Canal Ringroad',
      kind: 'expressway',
      areaId: 'LL-CITY-N026',
    },
    {
      id: 'LL-CITY-ROAD04',
      name: 'Glassward East Coastway',
      kind: 'expressway',
      areaId: 'LL-CITY-N039',
    },
    {
      id: 'LL-CITY-ROAD05',
      name: 'Glassward West Coastway',
      kind: 'expressway',
      areaId: 'LL-CITY-N045',
    },
    {
      id: 'LL-CITY-ROAD06',
      name: 'Ironhaven Elevated Ring',
      kind: 'expressway',
      areaId: 'LL-CITY-N061',
    },
    {
      id: 'LL-CITY-ROAD07',
      name: 'Ironhaven Bore',
      kind: 'road_tunnel',
      areaId: 'LL-CITY-N059',
    },
    {
      id: 'LL-CITY-ROAD08',
      name: 'Foundry Underpass',
      kind: 'road_tunnel',
      areaId: 'LL-CITY-N015',
    },
    {
      id: 'LL-CITY-ROAD09',
      name: 'South Lantern Bore',
      kind: 'road_tunnel',
      areaId: 'LL-CITY-N047',
    },
  ],
  waterways: [
    {
      id: 'LL-CITY-WATER01',
      name: 'Harbor Channel',
    },
    {
      id: 'LL-CITY-WATER02',
      name: 'Ironwater Reach',
    },
    {
      id: 'LL-CITY-WATER03',
      name: 'Brigid Sound',
    },
    {
      id: 'LL-CITY-WATER04',
      name: 'Forge Canal',
    },
    {
      id: 'LL-CITY-WATER05',
      name: 'Outer Harbor Waters',
    },
  ],
  inactiveRail: [
    {
      id: 'LL-CITY-RAIL01',
      name: 'Foundry Closed Platform',
      areaId: 'LL-CITY-N015',
      access: 'inactive_station; accessible architectural/track environment',
    },
    {
      id: 'LL-CITY-RAIL02',
      name: 'Breakwater Rail Depot',
      areaId: 'LL-CITY-N007',
      access: 'rail_service_yard',
    },
    {
      id: 'LL-CITY-RAIL03',
      name: 'Foundry Transfer Remnant',
      areaId: 'LL-CITY-N015',
      access: 'abandoned_rail_environment',
    },
    {
      id: 'LL-CITY-RAIL04',
      name: 'Coldstore Viaduct',
      areaId: 'LL-CITY-N040',
      access: 'abandoned_rail_environment',
    },
    {
      id: 'LL-CITY-RAIL05',
      name: 'Ledger Transit Junction',
      areaId: 'LL-CITY-N039',
      access: 'underground_maintenance_environment',
    },
  ],
  tolls: [
    {
      id: 'LL-CITY-TOLL01',
      name: 'Pump Reach Toll',
    },
    {
      id: 'LL-CITY-TOLL02',
      name: 'Brigid Sound Toll',
    },
    {
      id: 'LL-CITY-TOLL03',
      name: 'Airfield Long-stay Gate',
    },
  ],
};

const WIDTH = 12000,
  HEIGHT = 10000;
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const slug = (value) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const areaId = (number) => `LL-CITY-N${String(number).padStart(3, '0')}`;
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point.y !== b[1] > point.y &&
      point.x < ((b[0] - a[0]) * (point.y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function rectPoints(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
    { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
  ];
}
function roadBox(road, padding = 0) {
  const half = road.width / 2 + padding;
  return {
    x: Math.min(road.x1, road.x2) - half,
    y: Math.min(road.y1, road.y2) - half,
    w: Math.abs(road.x2 - road.x1) + half * 2,
    h: Math.abs(road.y2 - road.y1) + half * 2,
  };
}
function projectToRoad(point, road) {
  const dx = road.x2 - road.x1,
    dy = road.y2 - road.y1,
    t = clamp(
      ((point.x - road.x1) * dx + (point.y - road.y1) * dy) / (dx * dx + dy * dy || 1),
      0,
      1,
    );
  return { x: road.x1 + dx * t, y: road.y1 + dy * t };
}

// Coordinates are authored here, independent of source cartography. The original
// prologue sits on the western harbor; the rest of the city wraps several bays.
const AREA_BOUNDS = {
  1: [1300, 40, 408, 640],
  2: [2100, 4000, 1350, 900],
  3: [650, 40, 630, 440],
  4: [40, 500, 600, 430],
  5: [1300, 700, 408, 700],
  6: [40, 950, 600, 450],
  7: [660, 500, 620, 430],
  8: [40, 40, 600, 440],
  9: [80, 2100, 1420, 1450],
  10: [2300, 1600, 1150, 1200],
  11: [660, 950, 620, 950],
  12: [1600, 3000, 1500, 700],
  13: [8150, 500, 1550, 950],
  14: [6500, 400, 600, 1000],
  15: [7200, 500, 850, 1050],
  16: [9800, 500, 1900, 2450],
  17: [7200, 1700, 1300, 1200],
  18: [8600, 1550, 1100, 1400],
  19: [7200, 3050, 1300, 600],
  20: [8600, 3050, 3100, 600],
  21: [4900, 1500, 1350, 900],
  22: [4180, 1670, 660, 1050],
  23: [4800, 2600, 800, 700],
  24: [5650, 2700, 700, 750],
  25: [3900, 2850, 750, 800],
  26: [4800, 3500, 850, 550],
  27: [5750, 3520, 550, 550],
  30: [5970, 5400, 1340, 1600],
  36: [9100, 5500, 700, 1100],
  53: [10000, 8300, 1000, 1200],
  57: [100, 5700, 1000, 1300],
  58: [1200, 5700, 1050, 1150],
  59: [2450, 5900, 1300, 1300],
  60: [1200, 7000, 1050, 1300],
  61: [100, 7200, 1000, 1450],
  62: [2450, 7300, 1350, 1000],
  63: [1200, 8450, 1050, 1250],
  64: [2450, 8450, 880, 1200],
  65: [650, 8800, 480, 800],
};
const GLASS_CELLS = [
  [34, 0, 0],
  [35, 1, 0],
  [28, 2, 0],
  [29, 3, 0],
  [41, 4, 0],
  [33, 0, 1],
  [31, 3, 1],
  [39, 4, 1],
  [32, 0, 2],
  [37, 3, 2],
  [38, 4, 2],
  [45, 0, 3],
  [42, 1, 3],
  [43, 2, 3],
  [44, 3, 3],
  [54, 4, 3],
  [40, 0, 4],
  [56, 1, 4],
  [49, 2, 4],
  [55, 3, 4],
  [50, 4, 4],
  [46, 0, 5],
  [47, 1, 5],
  [48, 2, 5],
  [52, 3, 5],
  [51, 4, 5],
];
for (const [number, col, row] of GLASS_CELLS)
  AREA_BOUNDS[number] = [5250 + col * 720, 4550 + row * 850, 620, 750];

const DISTRICTS = [
  {
    id: 'breakwater',
    name: 'Breakwater',
    x: 40,
    y: 40,
    w: 3560,
    h: 4960,
    color: '#967d64',
    morphology: 'inlet peninsula, old freight grids, cliff switchbacks and a west-facing boardwalk',
  },
  {
    id: 'saint-brigid',
    name: 'Saint Brigid',
    x: 6500,
    y: 400,
    w: 5200,
    h: 3250,
    color: '#71817c',
    morphology:
      'broad airport mainland, garden crescents, exhibition park and a detached pump island',
  },
  {
    id: 'the-narrows',
    name: 'The Narrows',
    x: 3900,
    y: 1300,
    w: 2600,
    h: 2800,
    color: '#7c716a',
    morphology: 'canal island, tightly stepped estates, dock cuts and elevated rail streets',
  },
  {
    id: 'glassward',
    name: 'Glassward',
    x: 5200,
    y: 4500,
    w: 5800,
    h: 5100,
    color: '#8395a1',
    morphology:
      'dense plaza grid around a large park, finance towers, service island and boat-only memorial island',
  },
  {
    id: 'ironhaven',
    name: 'Ironhaven',
    x: 40,
    y: 5400,
    w: 3960,
    h: 4350,
    color: '#787f81',
    morphology: 'industrial mainland fan, long factory blocks, canal yards and shipbuilding quays',
  },
];
const LANDFORMS = [
  {
    id: 'breakwater-peninsula',
    districtId: 'breakwater',
    name: 'Western Harbor Peninsula',
    polygon: [
      [40, 40],
      [1710, 40],
      [1710, 1400],
      [2620, 1400],
      [2620, 500],
      [3600, 500],
      [3600, 4900],
      [2100, 5000],
      [2100, 4650],
      [1500, 4650],
      [1500, 3850],
      [40, 3850],
    ],
  },
  {
    id: 'brigid-mainland',
    districtId: 'saint-brigid',
    name: 'Airfield Uplands',
    polygon: [
      [7120, 420],
      [9700, 320],
      [11860, 460],
      [11880, 3150],
      [11680, 3750],
      [7140, 3750],
      [7140, 1600],
    ],
  },
  {
    id: 'pump-island',
    districtId: 'saint-brigid',
    name: 'Pump Island',
    polygon: [
      [6510, 450],
      [7000, 400],
      [7100, 600],
      [7100, 1200],
      [6970, 1400],
      [6500, 1300],
      [6430, 1000],
    ],
  },
  {
    id: 'canal-island',
    districtId: 'the-narrows',
    name: 'Canal Island',
    polygon: [
      [3900, 1600],
      [4800, 1300],
      [6200, 1300],
      [6500, 1800],
      [6350, 4100],
      [3900, 4100],
    ],
  },
  {
    id: 'glassward-peninsula',
    districtId: 'glassward',
    name: 'Glassward Civic Peninsula',
    polygon: [
      [5200, 4480],
      [6800, 4420],
      [8800, 4480],
      [8850, 8400],
      [8700, 9600],
      [7300, 9660],
      [5150, 9580],
      [5070, 7500],
    ],
  },
  {
    id: 'beacon-island',
    districtId: 'glassward',
    name: 'Beacon Island',
    polygon: [
      [9140, 5520],
      [9710, 5500],
      [9860, 5850],
      [9780, 6510],
      [9230, 6660],
      [9090, 6250],
    ],
  },
  {
    id: 'lantern-island',
    districtId: 'glassward',
    name: 'Lantern Island',
    access: 'boat-only',
    polygon: [
      [10050, 8400],
      [10520, 8290],
      [11010, 8570],
      [10920, 9270],
      [10500, 9520],
      [10000, 9300],
    ],
  },
  {
    id: 'ironhaven-mainland',
    districtId: 'ironhaven',
    name: 'Ironwater Industrial Mainland',
    polygon: [
      [40, 5600],
      [1550, 5400],
      [3800, 5750],
      [4000, 7800],
      [3400, 9750],
      [600, 9750],
      [40, 8650],
    ],
  },
];
const LAKES = [
  { id: 'orchard-lake', x: 6400, y: 5750, w: 350, h: 230, name: 'Common Water Lake' },
  { id: 'worlds-lake', x: 8960, y: 2080, w: 240, h: 190, name: 'Exhibition Pool' },
  { id: 'northwater-lake', x: 5500, y: 1900, w: 210, h: 150, name: 'Northwater Lake' },
  { id: 'forge-canal', x: 1135, y: 8620, w: 65, h: 1130, name: 'Forge Canal' },
];
const PROFILE = {
  warehouse: {
    road: 80,
    block: 150,
    heights: [28, 44, 58],
    colors: ['#74776b', '#696d63'],
    form: 'freight-grid',
  },
  coastal: {
    road: 58,
    block: 180,
    heights: [26, 38, 48],
    colors: ['#a4947c', '#8e9985'],
    form: 'garden-loop',
  },
  historic: {
    road: 66,
    block: 110,
    heights: [48, 66, 84],
    colors: ['#a08c78', '#8b8478'],
    form: 'fine-grain-grid',
  },
  housing: {
    road: 70,
    block: 125,
    heights: [70, 95, 135],
    colors: ['#888c7d', '#9a8c75'],
    form: 'court-and-ring',
  },
  hillside: {
    road: 62,
    block: 120,
    heights: [42, 57, 73],
    colors: ['#9c947c', '#8c927c'],
    form: 'switchback',
  },
  park: {
    road: 42,
    block: 260,
    heights: [16, 22, 28],
    colors: ['#7d9575', '#899779'],
    form: 'promenade-and-service-loop',
  },
  airport: {
    road: 100,
    block: 240,
    heights: [30, 42, 55],
    colors: ['#87979b', '#7d8788'],
    form: 'apron-ring',
  },
  finance: {
    road: 96,
    block: 165,
    heights: [155, 220, 305],
    colors: ['#879ca0', '#9ba5a0'],
    form: 'plaza-grid',
  },
  industrial: {
    road: 94,
    block: 180,
    heights: [30, 48, 85],
    colors: ['#6e7c78', '#838579'],
    form: 'long-yard-grid',
  },
  university: {
    road: 62,
    block: 170,
    heights: [60, 82, 110],
    colors: ['#a19c87', '#8c9989'],
    form: 'quad-and-stair',
  },
  market: {
    road: 60,
    block: 105,
    heights: [42, 64, 82],
    colors: ['#9e9879', '#a49b83'],
    form: 'arcade-and-alley',
  },
  nightlife: {
    road: 66,
    block: 118,
    heights: [54, 78, 105],
    colors: ['#8d8990', '#999187'],
    form: 'service-lane-grid',
  },
  civic: {
    road: 82,
    block: 165,
    heights: [70, 104, 145],
    colors: ['#a4aa98', '#949c93'],
    form: 'forecourt-grid',
  },
  island: {
    road: 38,
    block: 165,
    heights: [24, 46, 65],
    colors: ['#9b9c85', '#8c987f'],
    form: 'shore-ring',
  },
};
const AREA_PROFILE = {
  1: 'warehouse',
  2: 'coastal',
  3: 'historic',
  4: 'historic',
  5: 'warehouse',
  6: 'coastal',
  7: 'housing',
  8: 'historic',
  9: 'park',
  10: 'hillside',
  11: 'historic',
  12: 'hillside',
  13: 'market',
  14: 'industrial',
  15: 'warehouse',
  16: 'airport',
  17: 'coastal',
  18: 'park',
  19: 'coastal',
  20: 'housing',
  21: 'park',
  22: 'industrial',
  23: 'hillside',
  24: 'industrial',
  25: 'coastal',
  26: 'housing',
  27: 'housing',
  28: 'housing',
  29: 'coastal',
  30: 'park',
  31: 'coastal',
  32: 'university',
  33: 'housing',
  34: 'housing',
  35: 'university',
  36: 'island',
  37: 'civic',
  38: 'finance',
  39: 'finance',
  40: 'nightlife',
  41: 'housing',
  42: 'nightlife',
  43: 'finance',
  44: 'civic',
  45: 'historic',
  46: 'housing',
  47: 'park',
  48: 'market',
  49: 'civic',
  50: 'finance',
  51: 'warehouse',
  52: 'coastal',
  53: 'island',
  54: 'historic',
  55: 'civic',
  56: 'university',
  57: 'hillside',
  58: 'housing',
  59: 'finance',
  60: 'historic',
  61: 'housing',
  62: 'warehouse',
  63: 'housing',
  64: 'industrial',
  65: 'industrial',
};

function createBlueprint() {
  const roads = clone(PROLOGUE.roads).map((road) => ({
    ...road,
    kind: 'prologue-street',
    access: ['foot', 'car'],
    z: 0,
    z1: 0,
    z2: 0,
    layer: 'ground',
    grade: 0,
    districtId: 'breakwater',
    name: road.id.startsWith('avenue')
      ? `${['Quay', 'Dispatch', 'Bell', 'Union', 'Rail', 'Dock'][Number(road.id.split('-')[1])]} Avenue`
      : `${['Ferry', 'Market', 'Shift', 'Canal', 'Lantern'][Number(road.id.split('-')[1])]} Street`,
  }));
  const buildings = clone(PROLOGUE.buildings).map((building) => ({
    ...building,
    protectedPrologue: true,
    district: 'breakwater',
    profile:
      building.type === 'warehouse'
        ? 'warehouse'
        : building.type === 'tenement'
          ? 'housing'
          : 'historic',
  }));
  const reserved = PROLOGUE.locations.map((point) => ({
    x: point.x - 25,
    y: point.y - 25,
    w: 50,
    h: 50,
  }));
  reserved.push(
    ...PROLOGUE.pickups.map((point) => ({ x: point.x - 16, y: point.y - 16, w: 32, h: 32 })),
  );
  const airportRunways = [
    { id: 'harbor-runway-east', x: 10960, y: 850, w: 130, h: 1640, heading: Math.PI / 2 },
    { id: 'harbor-short-apron', x: 10300, y: 2570, w: 1200, h: 120 },
  ];
  reserved.push(...airportRunways);
  const sites = [],
    landmarks = [],
    bridges = [],
    connections = [],
    decks = [],
    siteLots = [];
  const areas = CATALOGUE.areas.map((record) => {
    const number = Number(record.id.slice(-3)),
      [x, y, w, h] = AREA_BOUNDS[number],
      profile = AREA_PROFILE[number];
    return {
      id: record.id,
      catalogueId: record.id,
      name: record.name,
      districtId: slug(record.district),
      district: record.district,
      x,
      y,
      w,
      h,
      bounds: { x, y, w, h },
      profile,
      architecture: record.architecture,
      spatialAffordances: record.affordances,
      morphology: PROFILE[profile].form,
      roadIds: [],
      siteIds: [],
      landmarkIds: [],
      access: number === 53 ? ['foot', 'boat'] : ['foot', 'car'],
      landformId:
        number === 14
          ? 'pump-island'
          : number === 36
            ? 'beacon-island'
            : number === 53
              ? 'lantern-island'
              : {
                  Breakwater: 'breakwater-peninsula',
                  'Saint Brigid': 'brigid-mainland',
                  'The Narrows': 'canal-island',
                  Glassward: 'glassward-peninsula',
                  Ironhaven: 'ironhaven-mainland',
                }[record.district],
      implementation: {
        geometry: 'authored-blueprint',
        runtime: 'unintegrated',
        interiors: 'unimplemented',
      },
    };
  });
  const areaMap = new Map(areas.map((area) => [area.id, area]));
  const insideLand = (point) =>
    LANDFORMS.some((form) => pointInPolygon(point, form.polygon)) &&
    !LAKES.some((lake) => pointInRect(point, lake));
  const dryRect = (rect) => rectPoints(rect).every(insideLand);
  function addRoad(id, points, width = 72, extra = {}) {
    const ids = [];
    if (
      (extra.bridge || extra.tunnel) &&
      points.length === 3 &&
      points.every((point) => point[2] === undefined)
    ) {
      const [a, b, c] = points;
      points = [
        a,
        [a[0] + (b[0] - a[0]) * 0.65, a[1] + (b[1] - a[1]) * 0.65],
        b,
        [b[0] + (c[0] - b[0]) * 0.35, b[1] + (c[1] - b[1]) * 0.35],
        c,
      ];
    }
    if (
      (extra.bridge || extra.tunnel) &&
      points.length === 2 &&
      points[0][2] === undefined &&
      points[1][2] === undefined
    )
      points = [
        points[0],
        [
          points[0][0] + (points[1][0] - points[0][0]) * 0.35,
          points[0][1] + (points[1][1] - points[0][1]) * 0.35,
        ],
        [
          points[0][0] + (points[1][0] - points[0][0]) * 0.65,
          points[0][1] + (points[1][1] - points[0][1]) * 0.65,
        ],
        points[1],
      ];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const deck = extra.z || 0,
        z1 = a[2] ?? ((extra.bridge || extra.tunnel) && i > 1 ? deck : 0),
        z2 = b[2] ?? ((extra.bridge || extra.tunnel) && i < points.length - 1 ? deck : 0);
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const baseName = extra.catalogueId
        ? (
            CATALOGUE.crossings.find((item) => item.id === extra.catalogueId) ||
            CATALOGUE.arterials.find((item) => item.id === extra.catalogueId)
          )?.name
        : extra.neighbourhoodId
          ? areaMap.get(extra.neighbourhoodId)?.name
          : extra.districtId
            ? DISTRICTS.find((item) => item.id === extra.districtId)?.name
            : 'Harbor';
      const road = {
        id: `${id}:${i}`,
        name: `${baseName || 'Harbor'} ${extra.kind === 'promenade' ? 'Walk' : extra.kind === 'approach' ? 'Approach' : a[0] === b[0] ? 'Avenue' : 'Street'} ${i}`,
        x1: a[0],
        y1: a[1],
        x2: b[0],
        y2: b[1],
        width,
        kind: 'street',
        access: ['foot', 'car'],
        z: 0,
        ...extra,
        z1,
        z2,
        layer:
          z1 === 0 && z2 === 0
            ? 'ground'
            : z1 < 0 || z2 < 0
              ? 'subsurface'
              : z1 !== z2
                ? 'ramp'
                : 'elevated',
        grade: (z2 - z1) / length,
      };
      // Existing prologue collision silhouettes remain intact.
      if (
        !extra.bridge &&
        !extra.tunnel &&
        buildings.some(
          (building) => building.protectedPrologue && overlap(building, roadBox(road, 3)),
        )
      )
        continue;
      roads.push(road);
      ids.push(road.id);
      if (extra.bridge || extra.tunnel)
        decks.push({
          ...roadBox(road),
          roadId: road.id,
          kind: extra.tunnel ? 'tunnel-projection' : 'bridge-deck',
          z: road.z,
          z1,
          z2,
          grade: road.grade,
          layer: road.layer,
          surfaceCollision: !extra.tunnel,
        });
    }
    return ids;
  }
  const spines = {
    breakwater: [
      [480, 700],
      [480, 1550],
      [1750, 1550],
      [1750, 3600],
      [3200, 3600],
      [3200, 4400],
    ],
    'saint-brigid': [
      [7550, 800],
      [7550, 2100],
      [8820, 2100],
      [8820, 2360],
      [9360, 2360],
      [9360, 3300],
      [11000, 3300],
    ],
    'the-narrows': [
      [4200, 1700],
      [6000, 1700],
      [6000, 3750],
      [4200, 3750],
      [4200, 1700],
    ],
    glassward: [
      [5320, 4620],
      [8600, 4620],
      [8600, 9460],
      [5320, 9460],
      [5320, 4620],
    ],
    ironhaven: [
      [600, 6000],
      [1850, 6000],
      [3050, 6000],
      [3050, 7850],
      [1850, 7850],
      [1850, 8500],
      [1050, 8500],
      [1050, 9250],
      [900, 9250],
      [900, 8500],
      [600, 8500],
      [600, 6000],
    ],
  };
  for (const [district, points] of Object.entries(spines))
    addRoad(`${district}-arterial`, points, 96, { kind: 'arterial', districtId: district });
  addRoad(
    'breakwater-east-link',
    [
      [1750, 1550],
      [3200, 1550],
      [3200, 2100],
    ],
    84,
    { districtId: 'breakwater' },
  );
  addRoad(
    'narrows-cross-street',
    [
      [4200, 2750],
      [6000, 2750],
    ],
    80,
    { districtId: 'the-narrows' },
  );
  addRoad(
    'glassward-cross',
    [
      [5200, 7050],
      [8800, 7050],
    ],
    94,
    { districtId: 'glassward' },
  );
  addRoad(
    'glassward-mid',
    [
      [7360, 4500],
      [7360, 9600],
    ],
    88,
    { districtId: 'glassward' },
  );
  addRoad(
    'founders-walk-south',
    [
      [780, 1220],
      [780, 1750],
      [1200, 1750],
    ],
    72,
    { districtId: 'breakwater' },
  );

  for (const area of areas) {
    const number = Number(area.id.slice(-3)),
      style = PROFILE[area.profile],
      b = area.bounds;
    if (number <= 8 && number !== 2) {
      const matching = roads.filter((road) => overlap(b, roadBox(road, 0)));
      const centre = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      area.gateway = matching
        .map((road) => ({ ...projectToRoad(centre, road), roadId: road.id }))
        .sort((a, b) => distance(a, centre) - distance(b, centre))[0];
      area.roadIds.push(...matching.map((road) => road.id));
      continue;
    }
    const inset = number === 53 ? 220 : area.profile === 'island' ? 150 : number === 14 ? 120 : 65;
    const top = number === 11 ? 1425 : b.y + inset,
      left = b.x + inset,
      right = b.x + b.w - inset,
      bottom = b.y + b.h - inset;
    area.roadIds.push(
      ...addRoad(
        `${area.id}-ring`,
        [
          [left, top],
          [right, top],
          [right, bottom],
          [left, bottom],
          [left, top],
        ],
        style.road,
        {
          neighbourhoodId: area.id,
          districtId: area.districtId,
          kind: area.profile === 'park' ? 'park-service' : 'local',
          access: number === 53 ? ['foot'] : ['foot', 'car'],
        },
      ),
    );
    const middleX = (left + right) / 2,
      middleY = (top + bottom) / 2;
    if (area.profile === 'hillside')
      area.roadIds.push(
        ...addRoad(
          `${area.id}-switchbacks`,
          [
            [left, middleY - 80],
            [middleX - 60, middleY - 80],
            [middleX - 60, middleY + 80],
            [right, middleY + 80],
          ],
          54,
          { neighbourhoodId: area.id, districtId: area.districtId, kind: 'switchback' },
        ),
      );
    else if (area.profile === 'park' || area.profile === 'island')
      area.roadIds.push(
        ...addRoad(
          `${area.id}-promenade`,
          [
            [left, middleY],
            [right, middleY],
          ],
          22,
          {
            neighbourhoodId: area.id,
            districtId: area.districtId,
            kind: 'promenade',
            access: ['foot'],
          },
        ),
      );
    else
      area.roadIds.push(
        ...addRoad(
          `${area.id}-cross`,
          [
            [left, middleY],
            [area.profile === 'airport' ? 10500 : right, middleY],
          ],
          style.road,
          { neighbourhoodId: area.id, districtId: area.districtId },
        ),
      );
    if (['finance', 'market', 'historic', 'housing', 'university'].includes(area.profile))
      area.roadIds.push(
        ...addRoad(
          `${area.id}-service`,
          [
            [middleX, top],
            [middleX, bottom],
          ],
          area.profile === 'finance' ? 76 : 40,
          { neighbourhoodId: area.id, districtId: area.districtId, kind: 'service' },
        ),
      );
    area.gateway = { x: left, y: top, roadId: area.roadIds[0] };
    if ([14, 36, 53].includes(number)) continue;
    const districtRoads = roads.filter(
      (road) => road.districtId === area.districtId && road.kind === 'arterial',
    );
    const nearest = districtRoads
      .map((road) => ({ ...projectToRoad(area.gateway, road), roadId: road.id }))
      .sort((a, b) => distance(a, area.gateway) - distance(b, area.gateway))[0];
    area.roadIds.push(
      ...addRoad(
        `${area.id}-approach`,
        [
          [area.gateway.x, area.gateway.y],
          [nearest.x, area.gateway.y],
          [nearest.x, nearest.y],
        ],
        72,
        { neighbourhoodId: area.id, districtId: area.districtId, kind: 'approach' },
      ),
    );
  }

  // Physical spans and their approach routes use new geography. Source endpoint
  // roles attach through authored access routes rather than source coordinates.
  const CROSSING_PATHS = [
    [
      [3200, 3600],
      [3900, 3600],
      [4200, 3600],
    ],
    [
      [3200, 2100],
      [3900, 2100],
      [4200, 2100],
    ],
    [
      [6750, 1300],
      [6750, 2450],
      [7750, 2450],
      [7750, 3300],
    ],
    [
      [6500, 900],
      [6000, 900],
      [6000, 1700],
    ],
    [
      [7080, 850],
      [7550, 850],
    ],
    [
      [7550, 3300],
      [6650, 3300],
      [6000, 3300],
    ],
    [
      [6000, 3750],
      [6000, 4500],
      [6640, 4500],
    ],
    [
      [5600, 3900],
      [5600, 4700],
      [6000, 4700],
    ],
    [
      [3050, 7850],
      [4400, 7850],
      [5200, 7850],
    ],
    [
      [8600, 5800],
      [9150, 5800],
      [9350, 5800],
    ],
    [
      [1060, 9000],
      [1145, 9000],
      [1180, 9000],
      [1260, 9000],
    ],
    [
      [6000, 3300],
      [6300, 3300],
    ],
  ];
  CATALOGUE.crossings.forEach((record, index) => {
    const path = CROSSING_PATHS[index],
      closed = ['derelict_crossing', 'unfinished_flyover'].includes(record.kind),
      railOnly = record.kind === 'rail_bridge';
    const extra = {
      kind: closed ? 'closed-crossing' : 'bridge',
      bridge: true,
      z: closed ? 18 : railOnly ? 24 : 28,
      access: closed ? [] : railOnly ? ['rail'] : ['foot', 'car'],
      catalogueId: record.id,
    };
    const broken = index === 10;
    const ids = broken
      ? [
          ...addRoad(
            `${record.id}-west`,
            [
              [path[0][0], path[0][1], 0],
              [path[1][0], path[1][1], 18],
            ],
            88,
            extra,
          ),
          ...addRoad(
            `${record.id}-east`,
            [
              [path[2][0], path[2][1], 18],
              [path[3][0], path[3][1], 0],
            ],
            88,
            extra,
          ),
        ]
      : addRoad(record.id, path, railOnly ? 28 : 88, extra);
    const graded = ids.map((id) => roads.find((road) => road.id === id));
    bridges.push({
      ...record,
      catalogueId: record.id,
      path: graded.length
        ? [
            { x: graded[0].x1, y: graded[0].y1, z: graded[0].z1 },
            ...graded.map((road) => ({ x: road.x2, y: road.y2, z: road.z2 })),
          ]
        : [],
      roadIds: ids,
      open: !closed,
      deckWidth: railOnly ? 28 : 88,
      clearance: closed ? 0 : railOnly ? 18 : 22,
      access: closed ? [] : railOnly ? ['rail'] : ['foot', 'car'],
      approachNeighbourhoodIds: record.areaIds,
      implementation: {
        geometry: 'authored-blueprint',
        gradeTraversal: 'unimplemented',
        tolls: 'unimplemented',
      },
    });
    if (broken)
      bridges.at(-1).gap = {
        from: { x: path[1][0], y: path[1][1], z: 18 },
        to: { x: path[2][0], y: path[2][1], z: 18 },
        reason: 'missing central deck',
      };
  });
  // A low western bridge connects the industrial mainland independently of the core.
  addRoad(
    'harbor-working-span',
    [
      [2500, 4835],
      [2500, 5450],
      [1850, 5450],
      [1850, 6000],
    ],
    86,
    { kind: 'bridge', bridge: true, z: 24, districtId: 'breakwater' },
  );
  addRoad(
    'brigid-market-spur',
    [
      [7550, 850],
      [8250, 850],
    ],
    78,
    { districtId: 'saint-brigid' },
  );
  addRoad(
    'beacon-shore-approach',
    [
      [9350, 5800],
      [9350, 5650],
      [9250, 5650],
    ],
    44,
    { districtId: 'glassward' },
  );
  addRoad(
    'pump-west-approach',
    [
      [6500, 900],
      [6620, 900],
    ],
    64,
    { districtId: 'saint-brigid' },
  );
  addRoad(
    'pump-east-approach',
    [
      [6980, 850],
      [7080, 850],
    ],
    64,
    { districtId: 'saint-brigid' },
  );
  addRoad(
    'pump-south-approach',
    [
      [6750, 1280],
      [6750, 1300],
    ],
    64,
    { districtId: 'saint-brigid' },
  );
  addRoad(
    'bellhaven-span-approach',
    [
      [7750, 3300],
      [7750, 3350],
    ],
    64,
    { districtId: 'saint-brigid' },
  );
  addRoad(
    'bellhaven-northspan-approach',
    [
      [7550, 3300],
      [7550, 3350],
    ],
    64,
    { districtId: 'saint-brigid' },
  );
  addRoad(
    'reservoir-span-approach',
    [
      [6640, 4500],
      [6640, 4620],
    ],
    72,
    { districtId: 'glassward' },
  );
  addRoad(
    'ironhaven-core-span-approach',
    [
      [5200, 7850],
      [5320, 7850],
    ],
    72,
    { districtId: 'glassward' },
  );
  const airportExpressway = addRoad(
    'LL-CITY-ROAD01',
    [
      [7550, 850],
      [9450, 850],
      [9450, 1900],
      [10000, 1900],
    ],
    88,
    { kind: 'expressway', districtId: 'saint-brigid', catalogueId: 'LL-CITY-ROAD01' },
  );
  const industrialSkyway = addRoad(
    'LL-CITY-ROAD06',
    [
      [1850, 6000],
      [1850, 6250],
      [3300, 6250],
      [3300, 9500],
      [500, 9500],
      [500, 5750],
      [1850, 5750],
      [1850, 6000],
    ],
    90,
    { kind: 'skyway', bridge: true, z: 24, districtId: 'ironhaven', catalogueId: 'LL-CITY-ROAD06' },
  );
  const tunnelPaths = [
    [
      [3050, 6500],
      [4400, 6500],
      [5200, 6500],
    ],
    [
      [7350, 900],
      [8100, 900],
    ],
    [
      [6020, 9350],
      [7040, 9350],
    ],
  ];
  const tunnels = CATALOGUE.arterials
    .filter((record) => record.kind === 'road_tunnel')
    .map((record, index) => {
      const ids = addRoad(record.id, tunnelPaths[index], 80, {
        kind: 'tunnel',
        tunnel: true,
        z: -18,
        access: ['car', 'foot'],
        catalogueId: record.id,
      });
      const graded = ids.map((id) => roads.find((road) => road.id === id));
      return {
        ...record,
        catalogueId: record.id,
        roadIds: ids,
        path: [
          { x: graded[0].x1, y: graded[0].y1, z: graded[0].z1 },
          ...graded.map((road) => ({ x: road.x2, y: road.y2, z: road.z2 })),
        ],
        portals: [
          { x: graded[0].x1, y: graded[0].y1, z: 0 },
          { x: graded.at(-1).x2, y: graded.at(-1).y2, z: 0 },
        ],
        interiorStatus: 'unimplemented',
      };
    });
  // Attach underground portals to the surface network without pretending an
  // interior transition, toll or train simulation already exists.
  for (const tunnel of tunnels)
    for (const portal of tunnel.portals) {
      const closest = roads
        .filter(
          (road) => !road.tunnel && road.z1 === 0 && road.z2 === 0 && road.access.includes('car'),
        )
        .map((road) => ({ ...projectToRoad(portal, road), roadId: road.id }))
        .sort((a, b) => distance(a, portal) - distance(b, portal))[0];
      addRoad(
        `${tunnel.id}-portal-${portal.x}`,
        [
          [portal.x, portal.y],
          [closest.x, portal.y],
          [closest.x, closest.y],
        ],
        64,
        { kind: 'tunnel-approach' },
      );
    }
  const lantern = areaMap.get(areaId(53)),
    boatDock = {
      id: 'lantern-island-landing',
      x: lantern.x + 70,
      y: lantern.y + 500,
      z: 0,
      neighbourhoodId: lantern.id,
      access: ['foot', 'boat'],
    };
  addRoad(
    'lantern-landing-walk',
    [
      [boatDock.x, boatDock.y],
      [lantern.gateway.x, boatDock.y],
      [lantern.gateway.x, lantern.gateway.y],
    ],
    24,
    {
      kind: 'landing-walk',
      access: ['foot'],
      neighbourhoodId: lantern.id,
      districtId: 'glassward',
    },
  );
  const southbank = areaMap.get(areaId(52)),
    departure = { x: southbank.x + southbank.w / 2, y: southbank.y + southbank.h - 35, z: 0 };
  addRoad(
    'southbank-landing-walk',
    [
      [departure.x, departure.y],
      [departure.x, southbank.y + southbank.h - 65],
    ],
    22,
    {
      kind: 'landing-walk',
      access: ['foot'],
      neighbourhoodId: southbank.id,
      districtId: 'glassward',
    },
  );
  connections.push({
    id: 'southbank-lantern-boat-link',
    mode: 'boat',
    from: departure,
    to: boatDock,
    neighbourhoodIds: [southbank.id, lantern.id],
    runtimeStatus: 'unimplemented',
  });

  // All authored roads are complete before parcel allocation. Capture each
  // padding's original roadBox arithmetic once; the index is only a broad
  // phase, so strict overlap and original road order remain authoritative.
  const roadVolumeIndexes = new Map();
  function nearbyRoadVolumes(rect, padding = 0) {
    let index = roadVolumeIndexes.get(padding);
    if (!index) {
      const volumes = roads.map((road) => ({ road, bounds: roadBox(road, padding) }));
      index = createSpatialIndex(volumes, { getBounds: (volume) => volume.bounds });
      roadVolumeIndexes.set(padding, index);
    }
    return index.queryRect(rect);
  }
  const roadConflict = (rect, pad = 4) =>
    nearbyRoadVolumes(rect, pad).some((volume) => overlap(rect, volume.bounds));

  function candidates(area) {
    const result = [],
      pool = nearbyRoadVolumes(area.bounds)
        .filter(
          ({ road, bounds }) =>
            road.access.includes('foot') &&
            road.z1 === 0 &&
            road.z2 === 0 &&
            overlap(area.bounds, bounds),
        )
        .map((volume) => volume.road);
    for (const road of pool) {
      const length = Math.hypot(road.x2 - road.x1, road.y2 - road.y1),
        dx = (road.x2 - road.x1) / length,
        dy = (road.y2 - road.y1) / length;
      for (let t = 45; t < length - 35; t += 65)
        for (const side of [-1, 1]) {
          const center = { x: road.x1 + dx * t, y: road.y1 + dy * t },
            normal = { x: -dy * side, y: dx * side };
          const entrance = {
            x: center.x + normal.x * (road.width / 2 + 11),
            y: center.y + normal.y * (road.width / 2 + 11),
            z: 0,
            roadId: road.id,
          };
          const lot =
            Math.abs(dx) > Math.abs(dy)
              ? { x: entrance.x - 9, y: entrance.y - 5, w: 18, h: 10 }
              : { x: entrance.x - 5, y: entrance.y - 9, w: 10, h: 18 };
          if (
            !rectPoints(lot).every((point) => pointInRect(point, area.bounds)) ||
            !dryRect(lot) ||
            roadConflict(lot, 2) ||
            siteLots.some((other) => overlap(lot, other)) ||
            buildings.some((b) => overlap(lot, b))
          )
            continue;
          result.push({ entrance, lot, normal, center });
        }
    }
    return result;
  }
  function allocateSite(record, area, kind = record.kind) {
    const options = candidates(area),
      big = /hospital|terminal|airport|cargo|museum|university|prison/.test(kind);
    for (const option of options) {
      const existing = buildings
        .filter(
          (b) =>
            overlap(b, area.bounds) &&
            pointInRect(
              {
                x: option.entrance.x + option.normal.x * 35,
                y: option.entrance.y + option.normal.y * 35,
              },
              b,
            ),
        )
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];
      let structure = existing;
      if (
        !structure &&
        !/park|public_art|memorial|monument|sculpture|plaza|boardwalk|pier|dock|sports/.test(kind)
      ) {
        for (const [w, h] of big
          ? [
              [150, 100],
              [90, 65],
              [52, 40],
              [36, 32],
            ]
          : [
              [64, 48],
              [44, 36],
              [36, 32],
            ]) {
          const center = {
              x: option.entrance.x + option.normal.x * (Math.max(w, h) / 2 + 13),
              y: option.entrance.y + option.normal.y * (Math.max(w, h) / 2 + 13),
            },
            rect = { x: center.x - w / 2, y: center.y - h / 2, w, h };
          if (
            !rectPoints(rect).every((point) => pointInRect(point, area.bounds)) ||
            !dryRect(rect) ||
            roadConflict(rect, 5) ||
            buildings.some((b) => overlap(rect, b)) ||
            siteLots.some((lot) => overlap(rect, lot)) ||
            reserved.some((other) => overlap(rect, other))
          )
            continue;
          const profile = PROFILE[area.profile];
          structure = {
            id: `site-building:${record.id}`,
            name: record.name,
            ...rect,
            height:
              kind === 'skyline_landmark'
                ? 210 + (Number(record.id.replace(/\D/g, '')) % 4) * 25
                : big
                  ? 94
                  : profile.heights[Number(record.id.replace(/\D/g, '')) % profile.heights.length],
            color: profile.colors[0],
            type: kind,
            profile: area.profile,
            theme: area.architecture,
            district: area.districtId,
            neighbourhoodId: area.id,
            siteIds: [],
          };
          buildings.push(structure);
          break;
        }
      }
      if (
        !structure &&
        !/park|public_art|memorial|monument|sculpture|plaza|boardwalk|pier|dock|sports|gondola/.test(
          kind,
        )
      )
        continue;
      const street = roads.find((road) => road.id === option.entrance.roadId);
      const addressNumber =
        Math.max(2, Math.round((option.center.x + option.center.y) / 8)) * 2 +
        (option.normal.x + option.normal.y > 0 ? 1 : 0);
      const needsInterior =
        !!record.access &&
        !/closed_facade|inaccessible|exterior_only/.test(record.access) &&
        /enterable|public_lobby|safehouse|mission_interior|mission_apartment|story_office|hidden_chamber/.test(
          record.access,
        );
      const site = {
        id: record.id,
        catalogueId: record.id,
        name: record.name,
        kind,
        neighbourhoodId: area.id,
        districtId: area.districtId,
        x: option.entrance.x,
        y: option.entrance.y,
        z: 0,
        lot: option.lot,
        buildingId: structure?.id || null,
        entrance: option.entrance,
        address: `${addressNumber} ${street.name}`,
        accessRule: record.access?.includes('closed')
          ? 'closed-facade'
          : record.access?.includes('inaccessible_interior_accessible_roof')
            ? 'exterior-roof-only'
            : record.access?.includes('exterior') || record.access?.includes('inaccessible')
              ? 'exterior-only'
              : record.access?.includes('mission') || record.access?.includes('story')
                ? 'story-gated'
                : 'public-approach',
        interior: {
          status: 'unimplemented',
          roomId: needsInterior ? `room:${record.id}` : null,
          required: needsInterior,
        },
        geometry: {
          kind: structure ? 'built-frontage' : 'reserved-landscape',
          forecourt: option.lot,
          structure: structure
            ? {
                x: structure.x,
                y: structure.y,
                w: structure.w,
                h: structure.h,
                height: structure.height,
              }
            : null,
          extent: /park|sports|airport/.test(kind) ? area.bounds : null,
          paths: /park|plaza|boardwalk|pier|dock/.test(kind) ? area.roadIds : [],
        },
        runtimeStatus: 'unintegrated',
      };
      siteLots.push(site.lot);
      area.siteIds.push(site.id);
      if (structure) {
        structure.siteIds ??= [];
        structure.siteIds.push(site.id);
      }
      sites.push(site);
      return site;
    }
    throw new Error(`No physical parcel available for ${record.id} in ${area.name}`);
  }
  const childParents = {
    'LL-CITY-LOC183': 'LL-CITY-LOC027',
    'LL-CITY-LOC184': 'LL-CITY-LOC028',
    'LL-CITY-LOC185': 'LL-CITY-LOC035',
    'LL-CITY-LOC186': 'LL-CITY-LOC031',
    'LL-CITY-LOC187': 'LL-CITY-LOC055',
  };
  for (const record of CATALOGUE.locations) {
    const area = areaMap.get(record.areaId),
      parentId = childParents[record.id];
    if (parentId) {
      const parent = sites.find((site) => site.id === parentId),
        structure = buildings.find((b) => b.id === parent.buildingId);
      const x = structure ? structure.x + Math.min(12, structure.w / 3) : parent.x,
        y = structure ? structure.y + Math.min(14, structure.h / 3) : parent.y;
      const site = {
        id: record.id,
        catalogueId: record.id,
        name: record.name,
        kind: record.kind,
        neighbourhoodId: area.id,
        districtId: area.districtId,
        x,
        y,
        z: 0,
        lot: { x: x - 1.5, y: y - 1, w: 3, h: 2 },
        buildingId: parent.buildingId,
        parentSiteId: parent.id,
        entrance: parent.entrance,
        address: `Inside ${parent.address}`,
        accessRule: record.id === 'LL-CITY-LOC187' ? 'scene-prop-only' : 'interior-only',
        interior: { status: 'unimplemented', roomId: parent.interior.roomId },
        runtimeStatus: 'unintegrated',
      };
      sites.push(site);
      area.siteIds.push(site.id);
    } else allocateSite(record, area);
  }

  // Landmarks are concrete footprint/approach slots, including wards without a
  // catalogued business. They do not silently become playable services.
  for (const area of areas) {
    for (let index = 0; index < 2; index++) {
      const record = {
        id: `HC-LANDMARK-${area.id.slice(-3)}-${index + 1}`,
        name: `${area.name} ${index ? 'Terrace' : 'Court'}`,
        kind: area.profile === 'park' ? 'park_landmark' : 'public_memorial',
        access: 'outdoor',
      };
      const slot = allocateSite(record, area);
      // Catalogue site coverage is exactly the researched locations; these are independent authored landmarks.
      sites.pop();
      area.siteIds.pop();
      area.landmarkIds.push(slot.id);
      landmarks.push({
        ...slot,
        catalogueId: null,
        kind:
          area.profile === 'warehouse' || area.profile === 'industrial'
            ? index
              ? 'loading-ramp'
              : 'freight-arcade'
            : area.profile === 'hillside'
              ? index
                ? 'stair-terrace'
                : 'viewpoint'
              : area.profile === 'park'
                ? index
                  ? 'performance-lawn'
                  : 'garden-gate'
                : index
                  ? 'service-court'
                  : 'public-plaza',
        geometry: {
          footprint: slot.lot,
          approach: [
            { ...slot.entrance },
            {
              ...projectToRoad(
                slot.entrance,
                roads.find((r) => r.id === slot.entrance.roadId),
              ),
              z: 0,
            },
          ],
          elevation: index && area.profile === 'hillside' ? 16 : 0,
        },
      });
    }
  }

  // Infill is deliberately deterministic, with morphology-specific block sizes,
  // setbacks and heights; it never overwrites roads, active prologue markers or site forecourts.
  for (const area of areas) {
    const profile = PROFILE[area.profile],
      step = profile.block * 0.55,
      b = area.bounds;
    if (Number(area.id.slice(-3)) <= 8 && Number(area.id.slice(-3)) !== 2) continue;
    for (let y = b.y + 80, row = 0; y < b.y + b.h - 65; y += step, row++)
      for (let x = b.x + 80, col = 0; x < b.x + b.w - 65; x += step, col++) {
        if (area.profile === 'park' && (row + col) % 5 !== 0) continue;
        const w =
          area.profile === 'warehouse' || area.profile === 'industrial'
            ? profile.block * 0.66
            : area.profile === 'finance'
              ? profile.block * 0.48
              : profile.block * 0.45;
        const h =
          area.profile === 'warehouse' || area.profile === 'industrial'
            ? profile.block * 0.43
            : profile.block * 0.52;
        const rect = { x, y, w, h };
        if (
          !rectPoints(rect).every((point) => pointInRect(point, b)) ||
          !dryRect(rect) ||
          roadConflict(rect, 9) ||
          buildings.some((other) => overlap(rect, other)) ||
          siteLots.some((lot) => overlap(rect, lot)) ||
          reserved.some((other) => overlap(rect, other))
        )
          continue;
        buildings.push({
          id: `HC-BLOCK-${area.id.slice(-3)}-${row}-${col}`,
          ...rect,
          height: profile.heights[(row * 3 + col) % profile.heights.length],
          color: profile.colors[(row + col) % profile.colors.length],
          type: area.profile,
          profile: area.profile,
          theme: area.architecture,
          district: area.districtId,
          neighbourhoodId: area.id,
        });
      }
  }

  // Exact operating-station IDs and call ordering are topology contracts. New
  // track lengths, platforms and entrances come from this authored geography.
  const stations = CATALOGUE.stations.map((record) => {
    const area = areaMap.get(record.areaId),
      hostId =
        record.id === 'LL-CITY-ST11'
          ? 'LL-CITY-LOC092'
          : record.id === 'LL-CITY-ST03'
            ? 'LL-CITY-LOC148'
            : null;
    const site = hostId
      ? sites.find((site) => site.id === hostId)
      : allocateSite({ ...record, kind: 'transport_station', access: 'public' }, area);
    if (!hostId) {
      sites.pop();
      area.siteIds.pop();
    }
    const roles =
      record.id === 'LL-CITY-ST04'
        ? ['upper', 'lower']
        : record.id === 'LL-CITY-ST11'
          ? ['outer_line_platform', 'inner_line_platform']
          : [
              CATALOGUE.services.some((service) =>
                service.calls.some(
                  (call) => call.stationId === record.id && call.role === 'inner_line_platform',
                ),
              )
                ? 'inner_line_platform'
                : 'outer_line_platform',
            ];
    const station = {
      id: record.id,
      catalogueId: record.id,
      name: record.name,
      neighbourhoodId: area.id,
      districtId: area.districtId,
      x: site.x,
      y: site.y,
      z: 0,
      buildingId: site.buildingId,
      hostSiteId: hostId,
      entrances: [{ id: `${record.id}-street-entry`, ...site.entrance }],
      platforms: roles.map((role, index) => ({
        id: `${record.id}:${role}`,
        role,
        x: site.x + (index ? 24 : 0),
        y: site.y,
        z:
          role === 'upper' ? 22 : role === 'lower' ? 12 : record.vertical === 'elevated' ? 18 : -18,
        length: 96,
        width: 9,
        axis: 'east-west',
      })),
      serviceIds: [],
      runtimeStatus: 'unintegrated',
    };
    return station;
  });
  const stationMap = new Map(stations.map((station) => [station.id, station]));
  const platformFor = (id, role) => {
    const station = stationMap.get(id);
    return station.platforms.find((platform) => platform.role === role) || station.platforms[0];
  };
  const tracks = [],
    trackKeys = new Map();
  function trackBetween(a, b) {
    const keys = [a.id, b.id].sort(),
      key = keys.join('|');
    if (trackKeys.has(key)) return trackKeys.get(key);
    const id = `HC-TRACK-${tracks.length + 1}`,
      midX = (a.x + b.x) / 2;
    const points = [
      { x: a.x, y: a.y, z: a.z },
      { x: midX, y: a.y, z: a.z },
      { x: midX, y: b.y, z: b.z },
      { x: b.x, y: b.y, z: b.z },
    ];
    tracks.push({
      id,
      platformIds: keys,
      fromPlatformId: a.id,
      toPlatformId: b.id,
      points,
      access: ['rail'],
      layer: a.z < 0 || b.z < 0 ? 'subsurface' : 'elevated',
      runtimeStatus: 'unintegrated',
      collisionAndGradeStatus: 'unimplemented',
    });
    trackKeys.set(key, id);
    return id;
  }
  const throughServices = CATALOGUE.services.map((service) => {
    const calls = service.calls.map((call) => {
      const platform = platformFor(call.stationId, call.role);
      stationMap.get(call.stationId).serviceIds.push(service.id);
      return { stationId: call.stationId, platformId: platform.id };
    });
    const trackIds = calls.map((call, index) =>
      trackBetween(
        platformFor(call.stationId, service.calls[index].role),
        platformFor(
          calls[(index + 1) % calls.length].stationId,
          service.calls[(index + 1) % calls.length].role,
        ),
      ),
    );
    const legs = calls.map((call, index) => {
      const track = tracks.find((track) => track.id === trackIds[index]);
      return {
        trackId: track.id,
        fromPlatformId: call.platformId,
        toPlatformId: calls[(index + 1) % calls.length].platformId,
        reverse: track.fromPlatformId !== call.platformId,
      };
    });
    return {
      id: service.id,
      catalogueId: service.id,
      name: service.name,
      segmentIds: service.segmentIds,
      calls,
      trackIds,
      legs,
      closedLoop: true,
      runtimeStatus: 'unimplemented',
    };
  });
  for (const station of stations) station.serviceIds = [...new Set(station.serviceIds)];
  const segments = CATALOGUE.segments.map((segment) => {
    const service = CATALOGUE.services.find((service) => service.segmentIds.includes(segment.id));
    return {
      ...segment,
      catalogueId: segment.id,
      calls: segment.calls.map((call) => ({
        stationId: call.stationId,
        platformId: platformFor(
          call.stationId,
          call.role === 'assigned_route_platform'
            ? service.calls.find((item) => item.stationId === call.stationId).role
            : call.role,
        ).id,
      })),
      runtimeStatus: 'unimplemented',
    };
  });

  const waterVolumes = CATALOGUE.waterways.map((record, index) => ({
    ...record,
    catalogueId: record.id,
    zMin: -30,
    zMax: 0,
    bounds:
      index === 0
        ? { x: 3600, y: 0, w: 3500, h: 4400 }
        : index === 1
          ? { x: 4000, y: 5400, w: 1200, h: 4300 }
          : index === 2
            ? { x: 6200, y: 1400, w: 950, h: 3000 }
            : index === 3
              ? { x: 1135, y: 8620, w: 65, h: 1130 }
              : { x: 0, y: 0, w: WIDTH, h: HEIGHT },
    clearanceVolumes: bridges
      .filter((bridge) => bridge.open)
      .map((bridge) => ({ bridgeId: bridge.id, clearance: bridge.clearance })),
    runtimeStatus: 'unintegrated',
  }));
  const water = [];
  for (let y = 0; y < HEIGHT; y += 100) {
    let run = null;
    for (let x = 0; x < WIDTH; x += 100) {
      const tile = { x, y, w: 100, h: 100 },
        wet = LAKES.some((lake) => overlap(tile, lake)) || !rectPoints(tile).some(insideLand);
      const safeWet =
        wet &&
        !nearbyRoadVolumes(tile, 2).some(
          ({ road, bounds }) => !road.tunnel && overlap(tile, bounds),
        ) &&
        !siteLots.some((lot) => overlap(tile, lot)) &&
        !buildings.some((b) => overlap(tile, b));
      if (safeWet) {
        if (run) run.w += 100;
        else run = { id: `HC-WATER-${x}-${y}`, x, y, w: 100, h: 100 };
      } else if (run) {
        water.push(run);
        run = null;
      }
    }
    if (run) water.push(run);
  }
  return {
    schemaVersion: 1,
    width: WIDTH,
    height: HEIGHT,
    title: 'Harbor City',
    description:
      'An authored coastal metropolis; geometry blueprint awaiting full runtime integration.',
    spawn: clone(PROLOGUE.spawn),
    bounds: { left: 40, top: 40, right: 11960, bottom: 9960 },
    districts: DISTRICTS,
    neighbourhoods: areas,
    landforms: LANDFORMS,
    lakes: LAKES,
    roads,
    buildings,
    locations: clone(PROLOGUE.locations),
    pickups: clone(PROLOGUE.pickups),
    obstacles: clone(PROLOGUE.obstacles),
    water,
    waterVolumes,
    sites,
    landmarks,
    bridges,
    tunnels,
    connections,
    decks,
    airport: {
      neighbourhoodId: areaId(16),
      runways: airportRunways,
      restrictedZones: [{ x: 10650, y: 680, w: 1050, h: 2000 }],
      runtimeStatus: 'unimplemented',
    },
    transit: {
      stations,
      segments,
      throughServices,
      tracks,
      interchanges: stations
        .filter((station) => station.platforms.length > 1)
        .map((station) => ({
          stationId: station.id,
          platformIds: station.platforms.map((platform) => platform.id),
          pedestrianTransfer: 'unimplemented',
        })),
      inactiveSites: CATALOGUE.inactiveRail,
      gondola: {
        id: 'LL-CITY-GONDOLA01',
        name: 'Skyline Gondola',
        terminalSiteIds: ['LL-CITY-LOC188', 'LL-CITY-LOC189'],
        cabins: 2,
        runtimeStatus: 'unimplemented',
      },
    },
    arterials: CATALOGUE.arterials.map((record, index) => ({
      ...record,
      catalogueId: record.id,
      roadIds:
        index === 0
          ? airportExpressway
          : index === 1
            ? roads
                .filter((road) => road.id.startsWith('breakwater-arterial'))
                .map((road) => road.id)
            : index === 2
              ? roads
                  .filter((road) => road.id.startsWith('the-narrows-arterial'))
                  .map((road) => road.id)
              : index === 3
                ? roads
                    .filter(
                      (road) =>
                        road.districtId === 'glassward' && road.x1 === 8600 && road.x2 === 8600,
                    )
                    .map((road) => road.id)
                : index === 4
                  ? roads
                      .filter(
                        (road) =>
                          road.districtId === 'glassward' && road.x1 === 5320 && road.x2 === 5320,
                      )
                      .map((road) => road.id)
                  : index === 5
                    ? industrialSkyway
                    : tunnels[index - 6].roadIds,
    })),
    tollSlots: CATALOGUE.tolls.map((toll, index) => ({
      ...toll,
      catalogueId: toll.id,
      x: index === 0 ? 7200 : index === 1 ? 6900 : 10080,
      y: index === 0 ? 850 : index === 1 ? 3300 : 2700,
      barrierStatus: 'unimplemented',
    })),
    legacy: {
      protectedBounds: { x: 40, y: 40, w: 1668, h: 1320 },
      roadIds: PROLOGUE.roads.map((road) => road.id),
      buildingIds: PROLOGUE.buildings.map((building) => building.id),
      runtimeBindings: PROLOGUE.locations.map((location) => ({
        id: location.id,
        x: location.x,
        y: location.y,
      })),
    },
    implementation: {
      geometry: 'authored-blueprint',
      cityRuntime: 'unintegrated',
      interiors: 'unimplemented',
      traffic: 'unimplemented',
      boats: 'unimplemented',
      trains: 'unimplemented',
      gondola: 'unimplemented',
    },
  };
}

export const CITY_BLUEPRINT = createBlueprint();
export const containsLand = (point) =>
  CITY_BLUEPRINT.landforms.some((form) => pointInPolygon(point, form.polygon)) &&
  !CITY_BLUEPRINT.lakes.some((lake) => pointInRect(point, lake));
export const roadReservation = (road) => roadBox(road, 0);
export default CITY_BLUEPRINT;
