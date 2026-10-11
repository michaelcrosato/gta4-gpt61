#!/usr/bin/env node
/** Report inventory claims and runtime content separately; never certify the full game. */
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORY_FILE = 'docs/research/story-source-map.json';
const SYSTEMS_FILE = 'docs/research/systems-source-map.json';
const CITY_FILE = 'docs/research/city-source-map.json';
const RUNTIME_FILE = 'src/simulation.js';
const BASELINE = {
  story: 90,
  systems: 869,
  city: 425,
  cityInventories: { neighbourhoods: 65, stations: 26, route_segments: 8, through_services: 4 },
  runtimeMissions: 4,
  runtimeStages: 25,
};
const STATUSES = ['planned', 'implemented', 'verified'];

export function collectRequirementRecords(value, records = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRequirementRecords(item, records);
  } else if (value && typeof value === 'object') {
    if (Object.hasOwn(value, 'source_item')) records.push(value);
    else for (const item of Object.values(value)) collectRequirementRecords(item, records);
  }
  return records;
}

function recordStatus(record, story = false) {
  if (!story) return record.status;
  return record.implementation_status === 'implemented' && record.verification_status === 'verified'
    ? 'verified'
    : record.implementation_status;
}

function statusCounts(records, story = false) {
  const counts = { total: records.length, planned: 0, implemented: 0, verified: 0, unknown: 0 };
  for (const record of records) {
    const status = recordStatus(record, story);
    counts[STATUSES.includes(status) ? status : 'unknown'] += 1;
  }
  return counts;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function requireUnique(records, field, label, issues) {
  for (const record of records) {
    if (typeof record[field] !== 'string' || !record[field].trim()) {
      issues.push(`${label}: record ${record.id || '(missing ID)'} has no valid ${field}.`);
    }
  }
  const values = records
    .map((record) => record[field])
    .filter((value) => typeof value === 'string');
  for (const value of duplicateValues(values))
    issues.push(`${label}: duplicate ${field} ${value}.`);
}

async function readableRepositoryFile(root, reference) {
  const name = typeof reference === 'string' ? reference : reference?.path;
  if (typeof name !== 'string' || !name.trim() || isAbsolute(name)) return false;
  const path = resolve(root, name.split('#')[0]);
  const fromRoot = relative(root, path);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return false;
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function inspectStatusEvidence(root, record, status, issues) {
  if (!STATUSES.includes(status)) {
    issues.push(`${record.id}: unknown status ${String(status)}.`);
    return;
  }
  if (status === 'planned') return;
  const refs = record.implementation_refs;
  if (!Array.isArray(refs) || refs.length === 0) {
    issues.push(
      `${record.id}: ${status} requires implementation_refs pointing to existing repository files.`,
    );
  } else {
    for (const reference of refs) {
      if (!(await readableRepositoryFile(root, reference))) {
        issues.push(
          `${record.id}: missing or invalid implementation reference ${JSON.stringify(reference)}.`,
        );
      }
    }
  }
  if (status !== 'verified') return;
  const evidence = record.verification_evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) {
    issues.push(
      `${record.id}: verified requires verification_evidence with a file, build and exercised criteria.`,
    );
    return;
  }
  for (const item of evidence) {
    const build = item?.build || item?.revision;
    if (
      !(await readableRepositoryFile(root, item)) ||
      typeof build !== 'string' ||
      !build.trim() ||
      !Array.isArray(item?.criteria) ||
      item.criteria.length === 0 ||
      item.criteria.some((criterion) => typeof criterion !== 'string' || !criterion.trim())
    ) {
      issues.push(`${record.id}: invalid verification evidence ${JSON.stringify(item)}.`);
    }
  }
}

/** Accept injected data for audits/tests while normal CLI use reads the real repository. */
export async function auditScope({
  root = ROOT,
  storyMap,
  systemsMap,
  cityMap,
  runtimeMissions,
} = {}) {
  const files = await Promise.all(
    [STORY_FILE, SYSTEMS_FILE, CITY_FILE, RUNTIME_FILE].map(async (path) => ({
      path,
      text: await readFile(resolve(root, path), 'utf8'),
    })),
  );
  const story = storyMap ?? JSON.parse(files[0].text);
  const systems = systemsMap ?? JSON.parse(files[1].text);
  const city = cityMap ?? JSON.parse(files[2].text);
  const missions =
    runtimeMissions ?? (await import(pathToFileURL(resolve(root, RUNTIME_FILE)).href)).MISSIONS;
  const issues = [];
  const notes = [];
  const countChecks = [];
  if (
    !Array.isArray(story.missions) ||
    !Array.isArray(story.characters) ||
    !Array.isArray(systems.systems) ||
    !systems.inventories ||
    typeof systems.inventories !== 'object' ||
    !city.inventories ||
    typeof city.inventories !== 'object' ||
    !Array.isArray(city.known_gaps)
  ) {
    throw new Error(
      'Source maps are missing required mission, character, system or inventory collections.',
    );
  }
  const systemRecords = [...systems.systems, ...collectRequirementRecords(systems.inventories)];
  const cityRecords = collectRequirementRecords(city.inventories);
  const inventories = Object.fromEntries(
    Object.entries(systems.inventories).map(([name, value]) => [
      name,
      statusCounts(collectRequirementRecords(value)),
    ]),
  );
  const cityInventories = Object.fromEntries(
    Object.entries(city.inventories).map(([name, value]) => [
      name,
      statusCounts(collectRequirementRecords(value)),
    ]),
  );
  const checkCount = (name, actual, declared) => {
    countChecks.push({ name, actual, declared, matches: actual === declared });
    if (!Number.isInteger(declared) || actual !== declared) {
      issues.push(`${name}: observed ${actual}, declared ${String(declared)}.`);
    }
  };
  checkCount(
    'Story mission titles',
    story.missions.length,
    story.counting?.unique_story_titles_in_map,
  );
  checkCount(
    'Notable story characters',
    story.characters.length,
    story.counting?.notable_characters_in_map,
  );
  for (const [name, counts] of Object.entries(inventories)) {
    checkCount(`System inventory ${name}`, counts.total, systems.inventory_summary?.[name]);
  }
  for (const name of Object.keys(systems.inventory_summary || {})) {
    if (!Object.hasOwn(inventories, name))
      issues.push(`Declared system inventory ${name} is absent.`);
  }
  for (const [name, counts] of Object.entries(cityInventories)) {
    checkCount(`City inventory ${name}`, counts.total, city.inventory_summary?.[name]);
  }
  for (const name of Object.keys(city.inventory_summary || {})) {
    if (!Object.hasOwn(cityInventories, name))
      issues.push(`Declared city inventory ${name} is absent.`);
  }
  for (const [name, minimum] of Object.entries(BASELINE.cityInventories)) {
    if ((cityInventories[name]?.total || 0) < minimum)
      issues.push(
        `City inventory ${name} shrank below the ${minimum}-record baseline; reconcile source scope before removing requirements.`,
      );
  }
  checkCount(
    'Declared city neighbourhood baseline',
    cityInventories.neighbourhoods?.total || 0,
    city.counting?.neighbourhood_baseline?.total,
  );
  const observedCityRegions = {};
  for (const record of city.inventories.neighbourhoods || [])
    observedCityRegions[record.source_borough] =
      (observedCityRegions[record.source_borough] || 0) + 1;
  const declaredCityRegions = city.counting?.neighbourhood_baseline?.by_source_region || {};
  for (const name of new Set([
    ...Object.keys(observedCityRegions),
    ...Object.keys(declaredCityRegions),
  ]))
    checkCount(
      `Declared city areas in ${name}`,
      observedCityRegions[name] || 0,
      declaredCityRegions[name],
    );
  checkCount(
    'Declared operating city station complexes',
    cityInventories.stations?.total || 0,
    city.transport_reconciliation?.enumerated_operating_station_complexes,
  );
  checkCount(
    'Declared city rail service labels',
    cityInventories.route_segments?.total || 0,
    city.transport_reconciliation?.service_labels,
  );
  checkCount(
    'Declared city directional through-services',
    cityInventories.through_services?.total || 0,
    city.transport_reconciliation?.directional_through_services,
  );
  if (story.missions.length < BASELINE.story)
    issues.push(
      'Story inventory shrank below the 90-title baseline; reconcile the full brief before removing requirements.',
    );
  if (systemRecords.length < BASELINE.systems)
    issues.push(
      'System inventory shrank below the 869-record baseline; reconcile the full brief before removing requirements.',
    );
  if (cityRecords.length < BASELINE.city)
    issues.push(
      'City inventory shrank below the 425-record baseline; reconcile the full brief before removing requirements.',
    );
  if (
    story.missions.length !== BASELINE.story ||
    systemRecords.length !== BASELINE.systems ||
    cityRecords.length !== BASELINE.city
  ) {
    notes.push(
      'The inventory differs from the 90-story/869-system/425-city baseline; review added/reconciled requirements and their acceptance coverage.',
    );
  }
  requireUnique(story.missions, 'source_title', 'Story missions', issues);
  requireUnique(
    [...story.missions, ...story.characters, ...systemRecords, ...cityRecords],
    'id',
    'Source records',
    issues,
  );
  requireUnique(story.sources || [], 'id', 'Story references', issues);
  requireUnique(systems.sources || [], 'id', 'System references', issues);
  requireUnique(city.sources || [], 'id', 'City references', issues);
  requireUnique(city.known_gaps, 'id', 'City research gaps', issues);
  const sourceIds = new Set((systems.sources || []).map((source) => source.id));
  const citySourceIds = new Set((city.sources || []).map((source) => source.id));
  const characterIds = new Set(story.characters.map((character) => character.id));
  for (const record of systemRecords) {
    if (!record.source_item || !record.original_counterpart)
      issues.push(`${record.id}: source identity or original counterpart is absent.`);
    if (
      !Array.isArray(record.sources) ||
      record.sources.length === 0 ||
      record.sources.some((id) => !sourceIds.has(id))
    )
      issues.push(`${record.id}: system source reference is absent or unresolved.`);
    const profile = systems.acceptance_profiles?.[record.acceptance_profile];
    if (!Array.isArray(profile) || profile.length === 0)
      issues.push(`${record.id}: acceptance profile is absent or empty.`);
  }
  const neighbourhoodIds = new Set(
    (city.inventories.neighbourhoods || []).map((record) => record.id),
  );
  const stationIds = new Set((city.inventories.stations || []).map((record) => record.id));
  const routeIds = new Set((city.inventories.route_segments || []).map((record) => record.id));
  const routeLabels = new Set(
    (city.inventories.route_segments || []).map((record) =>
      record.source_item?.replace(/^Route /, ''),
    ),
  );
  const systemIds = new Set(systemRecords.map((record) => record.id));
  const checkCityReference = (record, reference, targets, field) => {
    if (typeof reference !== 'string' || !targets.has(reference))
      issues.push(
        `${record.id}: city ${field} reference is absent or unresolved (${String(reference)}).`,
      );
  };
  for (const record of cityRecords) {
    if (!record.source_item || !record.original_counterpart)
      issues.push(`${record.id}: city source identity or original counterpart is absent.`);
    if (
      !Array.isArray(record.sources) ||
      record.sources.length === 0 ||
      record.sources.some((id) => !citySourceIds.has(id))
    )
      issues.push(`${record.id}: city source reference is absent or unresolved.`);
    const profile = city.acceptance_profiles?.[record.acceptance_profile];
    if (!Array.isArray(profile) || profile.length === 0)
      issues.push(`${record.id}: city acceptance profile is absent or empty.`);
    if (Object.hasOwn(record, 'original_neighbourhood_id'))
      checkCityReference(
        record,
        record.original_neighbourhood_id,
        neighbourhoodIds,
        'neighbourhood',
      );
    for (const reference of record.original_endpoint_neighbourhood_ids || [])
      checkCityReference(record, reference, neighbourhoodIds, 'endpoint neighbourhood');
    for (const reference of record.segment_ids || [])
      checkCityReference(record, reference, routeIds, 'route segment');
    for (const reference of record.source_loop_station_ids || [])
      checkCityReference(record, reference, stationIds, 'station');
    for (const call of [
      ...(record.source_ordered_calls || []),
      ...(record.source_loop_calls || []),
    ])
      checkCityReference(record, call?.station_id, stationIds, 'station call');
    if (record.source_handoff) {
      checkCityReference(
        record,
        record.source_handoff.boundary_station_id,
        stationIds,
        'handoff station',
      );
      checkCityReference(record, record.source_handoff.next_label, routeLabels, 'handoff route');
    }
    if (record.existing_system_record_id != null)
      checkCityReference(
        record,
        record.existing_system_record_id,
        systemIds,
        'existing system record',
      );
  }
  for (const record of story.missions) {
    if (
      !record.original_title ||
      !Array.isArray(record.acceptance_evidence_required) ||
      record.acceptance_evidence_required.length === 0
    )
      issues.push(`${record.id}: original title or required acceptance evidence is absent.`);
    if (
      !Array.isArray(record.original_contact_ids) ||
      record.original_contact_ids.some((id) => !characterIds.has(id))
    )
      issues.push(`${record.id}: original contact ID is absent or unresolved.`);
    if (
      record.verification_status === 'verified' &&
      !['implemented', 'verified'].includes(record.implementation_status)
    ) {
      issues.push(`${record.id}: verification claim conflicts with implementation status.`);
    }
    if (
      ![
        'not_implemented',
        'not_verified',
        'unverified',
        'pending',
        'in_progress',
        'failed',
        'verified',
      ].includes(record.verification_status)
    ) {
      issues.push(
        `${record.id}: unknown verification status ${String(record.verification_status)}.`,
      );
    }
    if (record.implementation_status === 'verified' && record.verification_status !== 'verified') {
      issues.push(
        `${record.id}: implemented/verification status fields disagree about verification.`,
      );
    }
  }
  await Promise.all([
    ...story.missions.map((record) =>
      inspectStatusEvidence(root, record, recordStatus(record, true), issues),
    ),
    ...story.characters.map((record) =>
      inspectStatusEvidence(root, record, recordStatus(record), issues),
    ),
    ...systemRecords.map((record) =>
      inspectStatusEvidence(root, record, recordStatus(record), issues),
    ),
    ...cityRecords.map((record) =>
      inspectStatusEvidence(root, record, recordStatus(record), issues),
    ),
  ]);
  const groups = {
    story_missions: statusCounts(story.missions, true),
    system_requirements: statusCounts(systemRecords),
    city_requirements: statusCounts(cityRecords),
    notable_story_characters: statusCounts(story.characters),
  };
  const claimedStoryImplementation =
    groups.story_missions.implemented + groups.story_missions.verified;
  checkCount(
    'Declared implemented source story missions',
    claimedStoryImplementation,
    story.counting?.implementation_total,
  );
  if (!Array.isArray(missions)) throw new Error('The runtime does not export a MISSIONS array.');
  requireUnique(missions, 'id', 'Runtime missions', issues);
  const runtimeRecords = missions.map((mission) => {
    if (!Array.isArray(mission.stages) || mission.stages.length === 0)
      issues.push(`${mission.id}: runtime mission has no stages.`);
    const types = {};
    for (const stage of mission.stages || []) {
      if (!stage || typeof stage.type !== 'string' || typeof stage.objective !== 'string') {
        issues.push(`${mission.id}: a runtime stage lacks an objective or type.`);
      } else types[stage.type] = (types[stage.type] || 0) + 1;
    }
    return {
      id: mission.id,
      title: mission.title,
      stages: mission.stages?.length || 0,
      stage_types: types,
    };
  });
  const stages = runtimeRecords.reduce((sum, mission) => sum + mission.stages, 0);
  if (missions.length !== BASELINE.runtimeMissions || stages !== BASELINE.runtimeStages) {
    notes.push(
      'Runtime content changed from the initial four-mission/25-stage opening; assess the new authored content separately.',
    );
  }
  const gaps = {
    story: (story.open_items || [])
      .filter((item) => !['resolved', 'closed', 'verified'].includes(item.status))
      .map((item) => item.id),
    systems: (systems.known_gaps || [])
      .filter((item) => item.blocks_research_complete !== false)
      .map((item) => item.id),
    city: (city.known_gaps || [])
      .filter((item) => item.blocks_research_complete !== false)
      .map((item) => item.id),
    systems_research_complete_claim: systems.research_complete === true,
    city_research_complete_claim: city.research_complete === true,
  };
  const unverified = Object.values(groups).reduce(
    (sum, group) => sum + group.total - group.verified,
    0,
  );
  const coverageUnfinished =
    unverified > 0 ||
    gaps.story.length > 0 ||
    gaps.systems.length > 0 ||
    gaps.city.length > 0 ||
    !gaps.systems_research_complete_claim ||
    !gaps.city_research_complete_claim;
  notes.push(
    'Runtime mission counts are independent opening content; no source requirement becomes implemented or verified because a count or title matches.',
  );
  notes.push(
    'Counts and existing evidence files report claims and metadata integrity. Full source parity, acceptance quality, natural playthroughs and final game completion still require a separate evidence review.',
  );
  return {
    format: 'lowlight-scope-status',
    schema_version: 1,
    inventory_files: files.map((file) => ({
      path: file.path,
      sha256: createHash('sha256').update(file.text).digest('hex'),
    })),
    source_claim_counts: groups,
    combined_story_and_system_requirement_count:
      groups.story_missions.total + groups.system_requirements.total,
    combined_story_system_and_city_requirement_count:
      groups.story_missions.total +
      groups.system_requirements.total +
      groups.city_requirements.total,
    system_inventory_claim_counts: inventories,
    city_inventory_claim_counts: cityInventories,
    runtime_opening: {
      module: RUNTIME_FILE,
      mission_count: missions.length,
      stage_count: stages,
      missions: runtimeRecords,
    },
    research_gaps: gaps,
    integrity: {
      issues: issues.sort(),
      count_checks: countChecks,
      metadata_consistent: issues.length === 0,
    },
    source_coverage_unfinished: coverageUnfinished,
    full_game_completion: 'not_certified_by_this_report',
    notes,
  };
}

function printHuman(report) {
  console.log('LOWLIGHT scope status — inventory claims, not a full-game completion certificate.');
  console.log('Collection                        Total  Planned  Implemented  Verified');
  for (const [name, counts] of Object.entries(report.source_claim_counts)) {
    console.log(
      `${name.padEnd(33)} ${String(counts.total).padStart(5)} ${String(counts.planned).padStart(8)} ${String(counts.implemented).padStart(12)} ${String(counts.verified).padStart(9)}`,
    );
  }
  console.log(
    `Legacy onboarding jobs (${report.runtime_opening.module} MISSIONS): ${report.runtime_opening.mission_count} missions / ${report.runtime_opening.stage_count} stages. Campaign missions are tracked in src/campaign.`,
  );
  for (const mission of report.runtime_opening.missions)
    console.log(`  ${mission.id}: ${mission.stages} stages — ${mission.title}`);
  console.log(
    `Open research gaps: ${report.research_gaps.story.length} story / ${report.research_gaps.systems.length} systems / ${report.research_gaps.city.length} city.`,
  );
  console.log(
    `Catalogue integrity issues: ${report.integrity.issues.length}. Count checks concern inventory metadata only.`,
  );
  for (const issue of report.integrity.issues) console.log(`  ISSUE: ${issue}`);
  console.log(
    `Source coverage: ${report.source_coverage_unfinished ? 'unfinished' : 'verification claims require acceptance review'}.`,
  );
  for (const note of report.notes) console.log(note);
}

export async function main(args = process.argv.slice(2)) {
  const allowed = new Set(['--json', '--require-verified', '--help']);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`Unknown argument: ${unknown.join(', ')}. Use --help.`);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/scope-status.mjs [--json] [--require-verified]');
    console.log(
      'Read real source maps and runtime mission exports. No repository files are changed.',
    );
    console.log('Exit 0: consistent catalogue metadata. Exit 1: malformed/inconsistent metadata.');
    console.log(
      'With --require-verified, exit 2 means source records or research gaps remain unfinished.',
    );
    console.log('No exit code certifies source parity or a finished full game.');
    return 0;
  }
  const report = await auditScope();
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (!report.integrity.metadata_consistent) return 1;
  return args.includes('--require-verified') && report.source_coverage_unfinished ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`Scope status could not be read: ${error.message}`);
      process.exitCode = 1;
    });
}
