/** Synthetic pure router/director permission contracts; no physical mission claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignAdapterRouter } from '../src/campaign/adapter-router.js';
import {
  CAMPAIGN_CONTENT,
  createCampaignDirector,
  campaignAvailability,
  startCampaignMission,
  saveCampaignDirector,
  restoreCampaignDirector,
} from '../src/campaign/director.js';
const clone = (v) => structuredClone(v);
function fixture({ optional = true } = {}) {
  const definition = clone(CAMPAIGN_CONTENT.missions[2]);
  // Dependencies are absent only in this isolated synthetic single-mission pack.
  definition.dependencies = { all: [] };
  const content = { ...clone(CAMPAIGN_CONTENT), missions: [definition] },
    world = { physicalDone: false };
  let permission = false;
  const calls = [],
    adapter = {
      capabilities: Object.fromEntries(definition.requiredCapabilities.map(({ id }) => [id, true])),
      supportsStage: (type, stage) =>
        definition.stages.some(
          (s) => s.type === type && JSON.stringify(s) === JSON.stringify(stage),
        ),
      activateStage: () => ({ ok: true }),
      supportsCondition: () => true,
      observe: () => false,
      supportsAction: () => true,
      applyActions: () => ({ ok: true }),
    };
  adapter.capabilities.director = false;
  if (optional)
    adapter.supportsMission = (id, mission) => {
      calls.push({ id, mission: clone(mission) });
      return permission;
    };
  const router = createCampaignAdapterRouter({
    content,
    registrations: [{ missionId: definition.id, adapter }],
    parent: {
      captureWorld: () => clone(world),
      validateWorld: (w) => typeof w?.physicalDone === 'boolean',
      restoreWorld: () => ({ ok: true }),
    },
  });
  return {
    content,
    definition,
    adapter,
    router,
    calls,
    setPermission: (v) => {
      permission = v;
    },
  };
}
test('all physical capabilities cannot override a registered mission data/failure denial or director capability', () => {
  const f = fixture(),
    s = createCampaignDirector({ content: f.content });
  for (const { id } of f.definition.requiredCapabilities)
    if (id !== 'director') assert.equal(f.router.capabilitiesForMission(f.definition.id)[id], true);
  assert.equal(f.router.capabilitiesForMission(f.definition.id).director, false);
  assert.equal(f.router.supportsMission(f.definition.id, f.definition), false);
  const available = campaignAvailability(s, f.router)[0];
  assert.equal(available.status, 'unmet-integration-gates');
  assert.equal(startCampaignMission(s, f.definition.id, f.router).ok, false);
  assert.equal(s.active, null);
  assert.equal(f.calls.at(-1).id, f.definition.id);
  assert.deepEqual(f.calls.at(-1).mission, f.definition);
  assert.equal(
    f.router.supportsStage(f.definition.stages[0].type, f.definition.stages[0]),
    true,
    'structural saved stage remains registered',
  );
});
test('changing optional activation readiness does not invalidate an existing strictly authored saved stage', () => {
  const f = fixture();
  f.setPermission(true);
  f.adapter.capabilities.director = true;
  const s = createCampaignDirector({ content: f.content });
  assert(startCampaignMission(s, f.definition.id, f.router).ok);
  const saved = saveCampaignDirector(s, f.router);
  f.setPermission(false);
  f.adapter.capabilities.director = false;
  const result = restoreCampaignDirector(saved.json, f.router);
  assert(result.ok);
  const restored = result.state;
  assert.equal(restored.active.stageId, 'dispatch-threat');
  assert.equal(restored.active.dialogue.index, 0);
  assert.equal(f.router.supportsMission(f.definition.id, f.definition), false);
  const changed = JSON.parse(saved.json);
  changed.director.active.stageId = 'invented';
  assert.throws(() => restoreCampaignDirector(JSON.stringify(changed), f.router));
});
test('handlers without optional mission API preserve prior structural registration and director capability', () => {
  const f = fixture({ optional: false });
  assert.equal(f.router.supportsMission(f.definition.id, f.definition), true);
  assert.equal(f.router.capabilitiesForMission(f.definition.id).director, true);
});
