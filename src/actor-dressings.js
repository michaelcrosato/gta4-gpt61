/** Small read-only art model. Saved injuries and their lifetime remain parent-owned. */
export const RIGHT_WRIST_BANDAGE_ART = Object.freeze({
  id: 'dax-wrist-bandage',
  color: '#c9c6a8',
  attachment: 'right-wrist',
  savedOnActor: true,
});
const plain = (v) => v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const value = (v, key) => Object.getOwnPropertyDescriptor(v, key)?.value;
function validBandage(v) {
  return (
    plain(v) &&
    Reflect.ownKeys(v).length === 4 &&
    Object.entries(RIGHT_WRIST_BANDAGE_ART).every(([key, expected]) => value(v, key) === expected)
  );
}
/** A validated parent view may outlive impairment. Active/expiry do not hide dressing. */
export function actorDressing(view, actorId) {
  if (
    !plain(view) ||
    value(view, 'actorId') !== actorId ||
    value(view, 'hand') !== 'right' ||
    value(view, 'bandageVisible') !== true ||
    !validBandage(value(view, 'bandage'))
  )
    return null;
  return RIGHT_WRIST_BANDAGE_ART;
}
const point = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const lerp = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
function capsule(g, a, b, radius, color, shift = 0) {
  const E = globalThis.My3D2dge,
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy),
    nx = length > 1e-8 ? -dy / length : 1,
    ny = length > 1e-8 ? dx / length : 0;
  E.px.poly(
    g,
    [
      [a[0] + nx * radius + shift, a[1] + ny * radius + shift],
      [b[0] + nx * radius + shift, b[1] + ny * radius + shift],
      [b[0] - nx * radius + shift, b[1] - ny * radius + shift],
      [a[0] - nx * radius + shift, a[1] - ny * radius + shift],
    ],
    color,
  );
  for (const p of [a, b])
    E.px.disc(g, p[0] + shift, p[1] + shift, Math.max(0.4, radius - 0.35), color);
}
/** Uses actual native projected elbowR/handR, including pose, squash and charView. */
export function enqueueRightWristBandage(art, bandage) {
  const elbow = art?.joints?.elbowR,
    hand = art?.joints?.handR;
  if (
    !validBandage(bandage) ||
    !point(elbow) ||
    !point(hand) ||
    !Number.isFinite(art.scale) ||
    art.scale <= 0 ||
    !Number.isFinite(art.limbWidth) ||
    art.limbWidth <= 0 ||
    typeof art.enqueue !== 'function'
  )
    return false;
  const a = lerp(elbow, hand, 0.68),
    b = lerp(elbow, hand, 0.97),
    radius = art.scale * ((art.limbWidth / 2) * 0.98 + 0.12),
    color = bandage.color;
  // Match the native forearm part depth, with a tiny cuff-over-sleeve bias.
  // Nearer torso/limb parts still occlude it through the unchanged native sort.
  art.enqueue((elbow[2] + hand[2]) / 2 + 0.003, (g) => {
    const E = globalThis.My3D2dge;
    capsule(g, a, b, radius, E.shade(color, -0.27));
    capsule(g, a, b, Math.max(0.4, radius - art.scale * 0.25), color, -0.25);
    if (art.scale >= 1.5) {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy) || 1,
        nx = (-dy / length) * radius * 0.7,
        ny = (dx / length) * radius * 0.7;
      for (const t of [0.3, 0.7]) {
        const p = lerp(a, b, t);
        E.px.line(g, p[0] - nx, p[1] - ny, p[0] + nx, p[1] + ny, E.shade(color, 0.18));
      }
    }
  });
  return true;
}
/** Keeps the native draw path unchanged without a validated visible dressing. */
export function drawActorWithDressing(g, ox, oy, rig, view, dressing, drawAdditional = null) {
  if (drawAdditional !== null && typeof drawAdditional !== 'function')
    throw new Error('Actor attachments require a synchronous draw callback.');
  if (!validBandage(dressing) && !drawAdditional) {
    rig.draw(g, ox, oy, view);
    return;
  }
  const previous = rig.o.drawAttachments;
  rig.o.drawAttachments = (g, art) => {
    const result = typeof previous === 'function' ? previous(g, art) : undefined;
    if (result && typeof result.then === 'function')
      throw new Error('Humanoid attachments must be synchronous.');
    const additional = drawAdditional?.(g, art);
    if (additional && typeof additional.then === 'function')
      throw new Error('Humanoid attachments must be synchronous.');
    if (validBandage(dressing)) enqueueRightWristBandage(art, dressing);
  };
  try {
    rig.draw(g, ox, oy, view);
  } finally {
    if (previous === undefined) delete rig.o.drawAttachments;
    else rig.o.drawAttachments = previous;
  }
}
