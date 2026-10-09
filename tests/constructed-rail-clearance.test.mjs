import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../src/world.js';
import { createConstructedRailClearance } from '../src/constructed-rail-clearance.js';
import { createRailClearance } from '../src/rail-clearance.js';
import { createTransit } from '../src/transit.js';
test('native generated columns are real static train blockers and actual initial consists retain exact clearance', () => {
  const checked = createConstructedRailClearance(WORLD),
    base = createRailClearance(WORLD),
    fleet = createTransit(WORLD);
  assert.equal(createConstructedRailClearance(WORLD), checked);
  assert.ok(checked.supportSolids.length > 600);
  assert.deepEqual(checked.dimensions, { length: 68, width: 20, height: 16 });
  const column = checked.supportSolids.find((s) => s.id.startsWith('rail-support:430,640,')),
    trackId = 'HC-TRACK-17@LL-CITY-SERVICE-01',
    fixture = {
      x: column.x + column.w / 2,
      y: column.y + column.h / 2,
      z: 0,
      heading: Math.PI / 2,
    };
  assert.ok(
    checked
      .inspectBody(fixture, trackId)
      .issues.some((i) => i.kind === 'solid-body' && i.solidId === column.id),
  );
  assert.equal(
    base.inspectBody(fixture, trackId).issues.some((i) => i.solidId === column.id),
    false,
    'base city metadata alone omits renderer support columns',
  );
  for (const train of fleet.trains) {
    const service = WORLD.transit.throughServices.find((s) => s.id === train.serviceId),
      leg = service.legs[train.callIndex];
    assert.equal(checked.inspectBody(train, leg.trackId).clear, true);
  }
});
