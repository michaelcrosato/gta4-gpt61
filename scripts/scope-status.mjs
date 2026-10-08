#!/usr/bin/env node
/** Report inventory claims and runtime content separately; never certify the full game. */
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORY_FILE = 'docs/research/story-source-map.json';
const SYSTEMS_FILE = 'docs/research/systems-source-map.json';
const RUNTIME_FILE = 'src/simulation.js';
const BASELINE = { story: 90, systems: 869, runtimeMissions: 4, runtimeStages: 25 };
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
export async function auditScope({ root = ROOT, storyMap, systemsMap, runtimeMissions } = {}) {
  const files = await Promise.all(
    [STORY_FILE, SYSTEMS_FILE, RUNTIME_FILE].map(async (path) => ({
      path,
      text: await readFile(resolve(root, path), 'utf8'),
    })),
  );
  const story = storyMap ?? JSON.parse(files[0].text);
  const systems = systemsMap ?? JSON.parse(files[1].text);
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
    typeof systems.inventories !== 'object'
  ) {
    throw new Error(
      'Source maps are missing required mission, character, system or inventory collections.',
    );
  }
  const systemRecords = [...systems.systems, ...collectRequirementRecords(systems.inventories)];
  const inventories = Object.fromEntries(
    Object.entries(systems.inventories).map(([name, value]) => [
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
  if (story.missions.length < BASELINE.story)
    issues.push(
      'Story inventory shrank below the 90-title baseline; reconcile the full brief before removing requirements.',
    );
  if (systemRecords.length < BASELINE.systems)
    issues.push(
      'System inventory shrank below the 869-record baseline; reconcile the full brief before removing requirements.',
    );
  if (story.missions.length !== BASELINE.story || systemRecords.length !== BASELINE.systems) {
    notes.push(
      'The inventory differs from the initial 90/869 baseline; review added/reconciled requirements and their acceptance coverage.',
    );
  }
  requireUnique(story.missions, 'source_title', 'Story missions', issues);
  requireUnique(
    [...story.missions, ...story.characters, ...systemRecords],
    'id',
    'Source records',
    issues,
  );
  requireUnique(story.sources || [], 'id', 'Story references', issues);
  requireUnique(systems.sources || [], 'id', 'System references', issues);
  const sourceIds = new Set((systems.sources || []).map((source) => source.id));
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
  ]);
  const groups = {
    story_missions: statusCounts(story.missions, true),
    system_requirements: statusCounts(systemRecords),
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
    systems_research_complete_claim: systems.research_complete === true,
  };
  const unverified = Object.values(groups).reduce(
    (sum, group) => sum + group.total - group.verified,
    0,
  );
  const coverageUnfinished =
    unverified > 0 ||
    gaps.story.length > 0 ||
    gaps.systems.length > 0 ||
    !gaps.systems_research_complete_claim;
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
    system_inventory_claim_counts: inventories,
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
    `Independent runtime opening: ${report.runtime_opening.mission_count} missions / ${report.runtime_opening.stage_count} stages.`,
  );
  for (const mission of report.runtime_opening.missions)
    console.log(`  ${mission.id}: ${mission.stages} stages — ${mission.title}`);
  console.log(
    `Open research gaps: ${report.research_gaps.story.length} story / ${report.research_gaps.systems.length} systems.`,
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
