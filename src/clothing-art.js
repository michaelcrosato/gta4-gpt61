import { OUTFITS } from './wardrobe.js';

function clothingRackAppearance(item) {
  return item.type === 'clothing-rack' && Object.hasOwn(OUTFITS, item.outfitId)
    ? OUTFITS[item.outfitId]
    : null;
}

/** Native projected stock, inside the existing physical rack envelope. The
 * room renderer owns depth, occlusion, damage and the surrounding actor queue.
 */
export function drawClothingRack(r, g, room, item, health = 100) {
  const outfit = clothingRackAppearance(item);
  if (!outfit || health <= 0) return false;
  const E = globalThis.My3D2dge,
    floor = room.floorZ,
    x0 = item.x + 3,
    x1 = item.x + item.w - 3,
    y = item.y + item.h / 2,
    top = floor + item.height,
    colors = outfit.colors,
    metal = '#556860',
    pale = '#b4baa4',
    line = (a, b, color, width = 1) => {
      const A = r.w(...a),
        B = r.w(...b);
      E.px.line(g, A[0], A[1], B[0], B[1], color, width);
    },
    polygon = (points, color) =>
      E.px.poly(
        g,
        points.map((point) => r.w(...point)),
        color,
      ),
    panel = (x, y, z, width, height, color) =>
      polygon(
        [
          [x, y, z],
          [x + width, y, z],
          [x + width, y, z + height],
          [x, y, z + height],
        ],
        color,
      );
  for (const x of [x0, x1]) {
    r.box(g, x - 1, y - 1, floor, x + 1, y + 1, top, pale, metal);
    r.box(g, x - 2, item.y + 2, floor, x + 2, item.y + item.h - 2, floor + 2, metal, '#364d44');
  }
  r.box(g, x0, y - 1, top - 2, x1, y + 1, top, pale, metal);
  for (const fraction of [0.28, 0.72]) {
    const cx = item.x + item.w * fraction,
      shoulder = top - 7,
      waist = floor + 17,
      hem = outfit.style === 'coat' ? floor + 9 : floor + 16,
      front = y + 1.3,
      color = outfit.style === 'coat' ? colors.coat : colors.cloth,
      outline = E.shade(color, -0.35);
    line([cx, y, top - 2], [cx, y, top - 4], '#c4b490');
    line([cx - 6, y, shoulder], [cx, y, top - 4], '#9f8d68');
    line([cx, y, top - 4], [cx + 6, y, shoulder], '#9f8d68');
    // Trousers remain visible below the shorter jacket; the rain shell drapes
    // over their upper section. Both sets use the actual equipped palette.
    for (const offset of [-5, 1]) {
      panel(cx + offset, y + 0.4, floor + 4, 4, waist - floor - 4, E.shade(colors.pants, -0.18));
      panel(cx + offset + 1, y + 0.6, floor + 5, 2, waist - floor - 5, colors.pants);
    }
    const silhouette = [
      [cx - 3, front, shoulder],
      [cx - 6, front, shoulder - 1],
      [cx - 9, front, waist + 3],
      [cx - 6, front, waist + 2],
      [cx - 5, front, hem],
      [cx + 5, front, hem],
      [cx + 6, front, waist + 2],
      [cx + 9, front, waist + 3],
      [cx + 6, front, shoulder - 1],
      [cx + 3, front, shoulder],
      [cx, front, shoulder - 3],
    ];
    polygon(silhouette, outline);
    polygon(
      silhouette.map(([x, y, z]) => [cx + (x - cx) * 0.84, y + 0.1, z + 0.3]),
      color,
    );
    line([cx, front + 0.3, hem + 1], [cx, front + 0.3, shoulder - 4], colors.trim);
    if (outfit.style === 'tunic') {
      for (const side of [-1, 1])
        line(
          [cx + side * 3, front + 0.3, shoulder - 1],
          [cx + side * 6, front + 0.3, shoulder - 3],
          colors.trim,
        );
    } else if (outfit.style === 'shirt') {
      polygon(
        [
          [cx - 2, front + 0.3, shoulder],
          [cx + 2, front + 0.3, shoulder],
          [cx, front + 0.3, shoulder - 4],
        ],
        '#c1cabb',
      );
    }
    for (const side of [-1, 1]) {
      line(
        [cx + side, front + 0.4, waist + 4],
        [cx + side * 4, front + 0.4, waist + 4],
        E.shade(color, -0.3),
      );
      line(
        [cx + side * 4, front + 0.4, waist + 4],
        [cx + side * 4, front + 0.4, waist + 1],
        E.shade(color, -0.3),
      );
    }
    panel(cx + 2, front + 0.5, shoulder - 6, 2, 2.5, '#d7cfac');
  }
  return true;
}
