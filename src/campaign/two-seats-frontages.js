/** Exact registered M3 wall details; no portal, volume, access or campaign mutation. */
import { TWO_SEATS_ROOMS } from './two-seats-scenes.js';
const definitions = Object.freeze({
  'tess-flat': Object.freeze({
    siteId: 'LL-CITY-LOC174',
    normal: 1,
    title: 'TESS FLAT',
    glyph: 'H',
  }),
  'pier-goods': Object.freeze({
    siteId: 'LL-CITY-LOC034',
    normal: -1,
    title: 'PIER GOODS',
    glyph: 'C',
  }),
});
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const samePoint = (a, b) => a && b && a.x === b.x && a.y === b.y && (a.z ?? 0) === (b.z ?? 0);
export function createTwoSeatsFrontageArt(world) {
  const records = new Map();
  if (world?.campaignSceneReports?.['LL-ST-003']?.registrationReady === true) {
    for (const [key, definition] of Object.entries(definitions)) {
      const binding = world.campaignSceneBindings?.[key],
        alias = world.locations?.find((l) => l.id === key),
        building = world.buildings?.find((b) => b.id === binding?.buildingId);
      if (
        !binding ||
        !alias ||
        !building ||
        binding.siteId !== definition.siteId ||
        alias.siteId !== definition.siteId ||
        alias.buildingId !== building.id ||
        binding.roomId !== key ||
        binding.portal?.id !== key + '-entry' ||
        !samePoint(alias, binding.entry) ||
        !building.siteIds?.includes(definition.siteId) ||
        ![
          building.x,
          building.y,
          building.w,
          building.h,
          building.height,
          binding.entry.x,
          binding.entry.y,
          binding.entry.z ?? 0,
        ].every(finite)
      )
        continue;
      const wallX = definition.normal > 0 ? building.x + building.w : building.x,
        gap = definition.normal * (binding.entry.x - wallX);
      if (
        gap < 0 ||
        gap > (alias.radius ?? 22) ||
        binding.entry.y < building.y ||
        binding.entry.y > building.y + building.h
      )
        continue;
      records.set(
        key,
        Object.freeze({
          key,
          ...definition,
          buildingId: building.id,
          wallX,
          entry: Object.freeze({ ...binding.entry }),
          radius: alias.radius ?? 22,
        }),
      );
    }
  }
  const enabled = (state) => records.size === 2 && !!state?.campaign?.completed?.['LL-ST-002'];
  return {
    enabled,
    locationGlyph(location, state) {
      return enabled(state) ? (records.get(location.id)?.glyph ?? null) : null;
    },
    draw(r, g, building, state, { cutaway = false } = {}) {
      if (!enabled(state)) return false;
      const record = [...records.values()].find((p) => p.buildingId === building.id);
      if (!record) return false;
      const front = record.normal * r.view.fx > 0.02,
        near =
          Math.hypot(state.player.x - record.entry.x, state.player.y - record.entry.y) <=
          record.radius + 12;
      if (!front && !(cutaway && near)) return false;
      const E = globalThis.My3D2dge,
        floor = building.z ?? 0,
        x = record.wallX + record.normal * 0.15,
        y = record.entry.y,
        top = floor + Math.min(31, building.height - 12),
        panel = (left, right, bottom, upper, color) =>
          E.px.poly(
            g,
            [
              r.w(x, left, bottom),
              r.w(x, right, bottom),
              r.w(x, right, upper),
              r.w(x, left, upper),
            ],
            color,
          ),
        line = (a, b, color, width = 1) => E.px.line(g, ...r.w(...a), ...r.w(...b), color, width),
        door =
          state.interior?.rooms?.[record.key]?.doors?.['front-door'] ??
          TWO_SEATS_ROOMS[record.key].doors.find((d) => d.id === 'front-door');
      panel(y - 9, y + 9, floor, top + 1, '#b4b594');
      panel(
        y - 7,
        y + 7,
        floor,
        top - 1,
        door.open ? '#1b332f' : door.locked ? '#796d53' : '#5a6b60',
      );
      line([x, y - 9, floor], [x, y - 9, top + 1], '#d0c5a0');
      line([x, y + 9, floor], [x, y + 9, top + 1], '#687c6c');
      line([x, y - 9, top + 1], [x, y + 9, top + 1], '#d0c5a0');
      if (!door.open) {
        line([x, y, floor + 2], [x, y, top - 2], '#334b43');
        line([x, y + 4, floor + 13], [x, y + 5, floor + 13], '#ded1a2', 2);
      }
      panel(y - 34, y + 34, top + 4, top + 12, '#3b574d');
      line([x, y - 34, top + 12], [x, y + 34, top + 12], '#b9bb91');
      const anchor = r.w(x, y, top + 9);
      E.font.text(g, record.title, anchor[0], anchor[1] - 3, '#e7dbad', {
        font: 'tiny',
        align: 'center',
        outline: '#203c33',
      });
      return true;
    },
  };
}
