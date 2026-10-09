/** Original clothing details on existing native rigs; no actors or campaign facts. */
import { TWO_SEATS_APPEARANCES } from './two-seats-scenes.js';
const identities = Object.freeze({
  'LL-CHAR-025': TWO_SEATS_APPEARANCES.tess,
  'LL-ARC-DAX': TWO_SEATS_APPEARANCES.dax,
  'LL-ARC-PEL': TWO_SEATS_APPEARANCES.pel,
  'LL-ARC-BEA': TWO_SEATS_APPEARANCES.bea,
});
export function twoSeatsAppearance(actor) {
  const expected = identities[actor?.id];
  return expected &&
    actor.appearance?.id === expected.id &&
    actor.appearance?.version === expected.version
    ? expected
    : null;
}
const point = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite),
  mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t),
  shifted = (p, d, amount) => p.map((v, i) => v + d[i] * amount),
  difference = (a, b) => a.map((v, i) => v - b[i]);
function ribbon(g, a, b, radius, color) {
  const E = globalThis.My3D2dge,
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy) || 1,
    nx = (-dy / length) * radius,
    ny = (dx / length) * radius;
  E.px.poly(
    g,
    [
      [a[0] + nx, a[1] + ny],
      [b[0] + nx, b[1] + ny],
      [b[0] - nx, b[1] - ny],
      [a[0] - nx, a[1] - ny],
    ],
    color,
  );
  for (const p of [a, b]) E.px.disc(g, p[0], p[1], Math.max(0.4, radius - 0.35), color);
}
/** Native projected shoulders/hips encode front visibility even when crouched/down. */
export function enqueueTwoSeatsMarks(art, appearance) {
  if (
    !Object.values(TWO_SEATS_APPEARANCES).includes(appearance) ||
    typeof art?.enqueue !== 'function' ||
    !Number.isFinite(art.scale) ||
    art.scale <= 0 ||
    !Number.isFinite(art.limbWidth) ||
    art.limbWidth <= 0
  )
    return false;
  const J = art.joints;
  if (
    ![
      'shL',
      'shR',
      'shC',
      'hipL',
      'hipR',
      'hipC',
      'kneeL',
      'kneeR',
      'elbowL',
      'elbowR',
      'handL',
      'handR',
    ].every((k) => point(J?.[k]))
  )
    return false;
  const E = globalThis.My3D2dge,
    span = difference(J.shR, J.shL),
    down = difference(J.hipC, J.shC),
    front = span[0] * down[1] - span[1] * down[0] < -1e-6,
    torsoDepth = (J.shC[2] + J.hipC[2]) / 2,
    line = (g, a, b, color, width = 1) => E.px.line(g, a[0], a[1], b[0], b[1], color, width),
    polygon = (g, pts, color) => E.px.poly(g, pts, color);
  for (const mark of appearance.marks) {
    if (mark.kind === 'cuffs') {
      for (const side of ['L', 'R']) {
        const elbow = J['elbow' + side],
          hand = J['hand' + side],
          a = mix(elbow, hand, 0.6),
          b = mix(elbow, hand, 0.94),
          radius = art.scale * (art.limbWidth / 2) * 1.02;
        art.enqueue((elbow[2] + hand[2]) / 2 + 0.003, (g) => {
          ribbon(g, a, b, radius, E.shade(mark.color, -0.25));
          ribbon(g, a, b, Math.max(0.4, radius - art.scale * 0.2), mark.color);
        });
      }
    } else if (front && mark.kind === 'diagonal-strap') {
      const a = mix(J.shR, J.shC, 0.12),
        b = mix(J.hipL, J.hipC, 0.1);
      art.enqueue(torsoDepth + 0.06, (g) => {
        line(g, a, b, E.shade(mark.color, -0.25), Math.max(1, art.scale * 0.9));
        line(g, a, b, mark.color, Math.max(1, art.scale * 0.5));
      });
    } else if (front && mark.kind === 'collar-tabs') {
      art.enqueue(torsoDepth + 0.06, (g) => {
        for (const shoulder of [J.shL, J.shR]) {
          const a = mix(shoulder, J.shC, 0.58),
            b = mix(a, J.hipC, 0.15);
          line(g, a, b, E.shade(mark.color, -0.2), Math.max(1, art.scale * 0.65));
          line(g, a, b, mark.color, Math.max(1, art.scale * 0.35));
        }
      });
    } else if (front && mark.kind === 'apron') {
      const top = mix(J.shC, J.hipC, 0.2),
        waist = mix(J.hipC, J.shC, 0.05),
        hem = mix(J.hipC, mix(J.kneeL, J.kneeR, 0.5), 0.3),
        topL = shifted(top, span, -0.23),
        topR = shifted(top, span, 0.23),
        waistL = shifted(waist, span, -0.36),
        waistR = shifted(waist, span, 0.36),
        hemL = shifted(hem, span, -0.4),
        hemR = shifted(hem, span, 0.4);
      art.enqueue(torsoDepth + 0.07, (g) => {
        polygon(g, [topL, topR, waistR, waistL], mark.color);
        line(g, topL, topR, E.shade(mark.color, 0.22));
        line(g, waistL, waistR, appearance.colors.trim);
      });
      art.enqueue((waist[2] + hem[2]) / 2 + 0.06, (g) => {
        polygon(g, [waistL, waistR, hemR, hemL], mark.color);
        line(g, hemL, hemR, E.shade(mark.color, -0.25));
        line(g, mix(waistL, hemL, 0.45), mix(waistR, hemR, 0.45), E.shade(mark.color, -0.2));
      });
    } else if (front && mark.kind === 'name-card' && mark.text === 'BEA') {
      const center = shifted(mix(J.shC, J.hipC, 0.36), span, -0.1),
        a = shifted(center, span, -0.28),
        b = shifted(center, span, 0.28),
        vertical = difference(J.hipC, J.shC),
        pts = [
          shifted(a, vertical, -0.12),
          shifted(b, vertical, -0.12),
          shifted(b, vertical, 0.12),
          shifted(a, vertical, 0.12),
        ];
      art.enqueue(torsoDepth + 0.09, (g) => {
        polygon(g, pts, '#d7d0ac');
        const left = Math.min(...pts.map((p) => p[0])),
          right = Math.max(...pts.map((p) => p[0])),
          top = Math.min(...pts.map((p) => p[1])),
          bottom = Math.max(...pts.map((p) => p[1]));
        if (
          right - left >= E.font.width(mark.text, { font: 'tiny' }) + 1 &&
          bottom - top >= E.font.lineHeight({ font: 'tiny' })
        )
          E.font.text(g, mark.text, center[0], top, '#354a47', { font: 'tiny', align: 'center' });
        else line(g, mix(a, b, 0.2), mix(a, b, 0.8), '#536b60');
      });
    }
  }
  return true;
}
