import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditScope } from '../scripts/scope-status.mjs';

// Metadata-only fixtures: in-memory copies of the real source maps with an injected runtime
// mission list. No source-map statuses change and no gameplay acceptance is inferred.
const read = async (name) =>
  JSON.parse(await readFile(new URL(`../docs/research/${name}`, import.meta.url), 'utf8'));
const maps = {
  storyMap: await read('story-source-map.json'),
  systemsMap: await read('systems-source-map.json'),
  cityMap: await read('city-source-map.json'),
};
const runtimeMissions = [
  { id: 'fixture-job', title: 'Fixture', stages: [{ type: 'travel', objective: 'Drive.' }] },
];
async function audit(change = () => {}) {
  const copy = structuredClone(maps);
  change(copy);
  return auditScope({ ...copy, runtimeMissions });
}
const issues = (report) => report.integrity.issues.join('\n');

test('the real catalogue is consistent and still reports unfinished coverage', async () => {
  const report = await audit();
  assert.equal(report.integrity.metadata_consistent, true, issues(report));
  assert.equal(report.source_coverage_unfinished, true);
  assert.equal(report.source_claim_counts.story_missions.total, 90);
  assert.equal(report.source_claim_counts.system_requirements.total, 869);
  assert.equal(report.source_claim_counts.city_requirements.total, 425);
  assert.equal(report.full_game_completion, 'not_certified_by_this_report');
});

test('count mismatches, ID collisions and unresolved city references are rejected', async () => {
  const report = await audit(({ storyMap, systemsMap, cityMap }) => {
    systemsMap.inventory_summary.weapons += 1;
    cityMap.inventories.neighbourhoods[0].id = storyMap.missions[0].id;
    cityMap.inventories.through_services[0].source_loop_calls[0].station_id = 'missing-station';
  });
  const text = issues(report);
  assert.equal(report.integrity.metadata_consistent, false);
  assert.match(text, /System inventory weapons: observed 17, declared 18/);
  assert.match(text, new RegExp(`duplicate id ${maps.storyMap.missions[0].id}`));
  assert.match(text, /city station call reference is absent or unresolved \(missing-station\)/);
});

test('silent inventory shrinkage and unsupported implementation claims are rejected', async () => {
  const report = await audit(({ storyMap, cityMap }) => {
    cityMap.inventories.stations.pop();
    cityMap.inventory_summary.stations -= 1;
    storyMap.missions[0].implementation_status = 'implemented';
  });
  const text = issues(report);
  assert.match(text, /City inventory stations shrank below the 26-record baseline/);
  assert.match(text, /LL-ST-001: implemented requires implementation_refs/);
  assert.match(text, /Declared implemented source story missions: observed 1/);
});
