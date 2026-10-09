/** Static rectangle index; geometry is captured once and item references stay intact. */
const MAX_ITEM_CELLS = 4096;
const MAX_QUERY_CELLS = 16384;

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`Invalid spatial ${label}: expected a finite number.`);
}

function rectangle(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`Invalid spatial ${label}: expected { x, y, w, h }.`);
  const { x, y, w, h } = value;
  for (const [key, number] of Object.entries({ x, y, w, h })) finite(number, `${label}.${key}`);
  if (w < 0 || h < 0)
    throw new RangeError(`Invalid spatial ${label}: width and height must be nonnegative.`);
  const right = x + w,
    bottom = y + h;
  finite(right, `${label}.right`);
  finite(bottom, `${label}.bottom`);
  return { left: x, top: y, right, bottom };
}

function overlaps(a, b) {
  // Closed bounds retain edge contacts and zero-width lines/points.
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function cellRange(bounds, cellSize, limit) {
  const left = Math.floor(bounds.left / cellSize),
    right = Math.floor(bounds.right / cellSize);
  const top = Math.floor(bounds.top / cellSize),
    bottom = Math.floor(bounds.bottom / cellSize);
  if (![left, right, top, bottom].every(Number.isSafeInteger)) return null;
  const columns = right - left + 1,
    rows = bottom - top + 1;
  // Never iterate unsafe indices or allocate one bucket per cell of a huge area.
  if (columns > limit || rows > limit || columns > limit / rows) return null;
  return { left, right, top, bottom };
}

/**
 * Build once for static geometry. Queries return original references, deduplicated
 * in their input order. Rectangles include touching edges. queryRadius is a broad
 * phase: it returns rectangles overlapping the circle's bounding square; callers
 * own exact circle, road, polygon and collision tests. Rebuild after moving items.
 * Large items use an overflow list and large queries scan captured bounds, keeping
 * cell iteration bounded. Invalid geometry/options/queries throw Error subclasses.
 */
export function createSpatialIndex(items, options = {}) {
  if (!Array.isArray(items)) throw new TypeError('Invalid spatial items: expected an array.');
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Invalid spatial options: expected an object.');
  const { cellSize = 256, getBounds = (item) => item } = options;
  finite(cellSize, 'cellSize');
  if (cellSize <= 0) throw new RangeError('Invalid spatial cellSize: must be positive.');
  if (typeof getBounds !== 'function')
    throw new TypeError('Invalid spatial getBounds: expected a function.');

  const records = [],
    overflow = [],
    cells = new Map(),
    seen = new Set();
  for (let i = 0; i < items.length; i++) {
    if (!Object.hasOwn(items, i))
      throw new TypeError('Invalid spatial items: sparse arrays are unsupported.');
    const item = items[i];
    if (seen.has(item)) continue;
    const bounds = rectangle(getBounds(item), `item[${i}] bounds`);
    seen.add(item);
    const id = records.length;
    records.push({ item, bounds });
    const range = cellRange(bounds, cellSize, MAX_ITEM_CELLS);
    if (!range) {
      overflow.push(id);
      continue;
    }
    for (let y = range.top; y <= range.bottom; y++)
      for (let x = range.left; x <= range.right; x++) {
        const key = `${x},${y}`;
        let bucket = cells.get(key);
        if (!bucket) cells.set(key, (bucket = []));
        bucket.push(id);
      }
  }

  function queryBounds(bounds) {
    const range = cellRange(bounds, cellSize, MAX_QUERY_CELLS);
    if (!range)
      return records
        .filter((record) => overlaps(record.bounds, bounds))
        .map((record) => record.item);
    const candidates = new Set(overflow);
    for (let y = range.top; y <= range.bottom; y++)
      for (let x = range.left; x <= range.right; x++)
        for (const id of cells.get(`${x},${y}`) ?? []) candidates.add(id);
    return [...candidates]
      .sort((a, b) => a - b)
      .filter((id) => overlaps(records[id].bounds, bounds))
      .map((id) => records[id].item);
  }

  return {
    queryRect(bounds) {
      return queryBounds(rectangle(bounds, 'query bounds'));
    },
    queryRadius(x, y, radius) {
      finite(x, 'query x');
      finite(y, 'query y');
      finite(radius, 'query radius');
      if (radius < 0) throw new RangeError('Invalid spatial query radius: must be nonnegative.');
      const left = x - radius,
        right = x + radius,
        top = y - radius,
        bottom = y + radius;
      for (const [key, value] of Object.entries({ left, right, top, bottom }))
        finite(value, `query ${key}`);
      return queryBounds({ left, right, top, bottom });
    },
  };
}
