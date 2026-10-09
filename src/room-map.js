/** A bounded local plan of the actual room, separate from Harbor City's coordinate system. */
import { interiorScene, interiorActors } from './interiors.js';
import { inScene } from './scene-context.js';

export function exteriorMapPosition(state) {
  return state.interior?.active?.exterior ?? state.player;
}
export function createRoomMapProjection(room, width, height, { padding = 8 } = {}) {
  if (
    !room ||
    ![room.width, room.height, width, height, padding].every(Number.isFinite) ||
    room.width <= 0 ||
    room.height <= 0 ||
    width <= padding * 2 ||
    height <= padding * 2 ||
    padding < 0
  )
    throw new Error('Invalid room map bounds.');
  const scale = Math.min((width - padding * 2) / room.width, (height - padding * 2) / room.height),
    x0 = (width - room.width * scale) / 2,
    y0 = (height - room.height * scale) / 2;
  return {
    scale,
    x0,
    y0,
    project: (x, y) => [x0 + x * scale, y0 + y * scale],
    unproject: (x, y) => ({ x: (x - x0) / scale, y: (y - y0) / scale }),
  };
}
function rectangle(g, projection, item, color) {
  const [x, y] = projection.project(item.x, item.y),
    [right, bottom] = projection.project(item.x + item.w, item.y + item.h);
  g.fillStyle = color;
  g.fillRect(
    Math.round(x),
    Math.round(y),
    Math.max(1, Math.round(right) - Math.round(x)),
    Math.max(1, Math.round(bottom) - Math.round(y)),
  );
}
function outline(g, projection, item, color) {
  const [x, y] = projection.project(item.x, item.y),
    [right, bottom] = projection.project(item.x + item.w, item.y + item.h),
    X = Math.round(x),
    Y = Math.round(y),
    w = Math.max(2, Math.round(right) - X),
    h = Math.max(2, Math.round(bottom) - Y);
  g.fillStyle = color;
  g.fillRect(X, Y, w, 1);
  g.fillRect(X, Y + h - 1, w, 1);
  g.fillRect(X, Y, 1, h);
  g.fillRect(X + w - 1, Y, 1, h);
}
function dot(g, x, y, color, size = 3) {
  g.fillStyle = color;
  g.fillRect(
    Math.round(x) - Math.floor(size / 2),
    Math.round(y) - Math.floor(size / 2),
    size,
    size,
  );
}
function arrow(g, point, angle, color, size = 6) {
  const c = Math.cos(angle),
    s = Math.sin(angle),
    points = [
      [size, 0],
      [-size * 0.65, size * 0.65],
      [-size * 0.3, 0],
      [-size * 0.65, -size * 0.65],
    ];
  g.fillStyle = color;
  g.strokeStyle = '#243a2b';
  g.lineWidth = 1;
  g.beginPath();
  points.forEach(([x, y], index) => {
    const px = point[0] + x * c - y * s,
      py = point[1] + x * s + y * c;
    if (index === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.closePath();
  g.fill();
  g.stroke();
}
function signature(room, saved) {
  return (
    room.doors
      .map((door) => `${door.id}:${saved.doors[door.id].open}:${saved.doors[door.id].locked}`)
      .join('|') + room.props.map((item) => `${item.id}:${saved.props[item.id].health}`).join('|')
  );
}
function background(g, room, saved, projection, width, height) {
  g.fillStyle = '#172c20';
  g.fillRect(0, 0, width, height);
  rectangle(g, projection, { x: 0, y: 0, w: room.width, h: room.height }, '#52634a');
  for (const region of room.floorRegions)
    rectangle(g, projection, region, region.material.includes('timber') ? '#756e4e' : '#5e7051');
  for (const wall of room.walls) rectangle(g, projection, wall, '#a0aa85');
  for (const item of room.props)
    if (saved.props[item.id].health > 0)
      rectangle(
        g,
        projection,
        item,
        saved.props[item.id].health < item.health ? '#796b53' : '#7f8c65',
      );
  for (const door of room.doors) {
    const current = saved.doors[door.id],
      color = current.locked ? '#bb8165' : current.open ? '#a8d2a6' : '#d4bd77';
    if (!current.open) rectangle(g, projection, door, color);
    else outline(g, projection, door, color);
  }
  for (const hook of room.hooks) {
    const p = projection.project(hook.x, hook.y);
    dot(g, p[0], p[1], hook.type === 'activity' ? '#e1c280' : '#99c8b4', 4);
  }
}

export function createRoomMap({ maxRooms = 2, maxPixels = 240000, createCanvas } = {}) {
  if (!Number.isInteger(maxRooms) || maxRooms < 1 || !Number.isInteger(maxPixels) || maxPixels < 1)
    throw new Error('Invalid room map cache limits.');
  const cache = new Map(),
    counts = { renders: 0, refreshes: 0, pixels: 0 };
  let disposed = false;
  function release(key) {
    const item = cache.get(key);
    if (!item) return;
    counts.pixels -= item.canvas.width * item.canvas.height;
    item.canvas.width = 0;
    item.canvas.height = 0;
    cache.delete(key);
  }
  function layer(room, saved, width, height, projection) {
    const key = `${room.id}:${width}:${height}`,
      version = signature(room, saved);
    let item = cache.get(key);
    if (item) {
      cache.delete(key);
      cache.set(key, item);
      if (item.signature === version) return item.canvas;
      counts.refreshes++;
    }
    if (!item) {
      if (width * height > maxPixels) return null;
      for (const [other, value] of cache) if (value.roomId === room.id) release(other);
      while (cache.size && (cache.size >= maxRooms || counts.pixels + width * height > maxPixels))
        release(cache.keys().next().value);
      let canvas;
      try {
        canvas = createCanvas?.() ?? globalThis.document?.createElement('canvas');
        if (!canvas) return null;
        canvas.width = width;
        canvas.height = height;
      } catch {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        return null;
      }
      item = { canvas, roomId: room.id, signature: null };
      cache.set(key, item);
      counts.pixels += width * height;
    }
    background(item.canvas.getContext('2d'), room, saved, projection, width, height);
    item.signature = version;
    counts.renders++;
    return item.canvas;
  }
  return {
    draw(g, state, { width = g.canvas.width, height = g.canvas.height } = {}) {
      if (disposed) throw new Error('The room map has been disposed.');
      const scene = interiorScene(state);
      if (!scene) return false;
      const room = scene.room,
        projection = createRoomMapProjection(room, width, height),
        canvas = layer(room, scene.state, width, height, projection);
      if (canvas) g.drawImage(canvas, 0, 0, width, height, 0, 0, width, height);
      else background(g, room, scene.state, projection, width, height);
      for (const actor of interiorActors(state)) {
        const p = projection.project(actor.x, actor.y);
        dot(
          g,
          p[0],
          p[1],
          actor.health <= 0
            ? '#394438'
            : actor.kind === 'police'
              ? '#ce8a70'
              : actor.kind === 'hostile'
                ? '#bd715e'
                : '#c3cba9',
          actor.health <= 0 ? 2 : 3,
        );
      }
      for (const car of state.vehicles || [])
        if (inScene(car, room.id))
          arrow(
            g,
            projection.project(car.x, car.y),
            car.angle || 0,
            car.id === state.player.vehicleId ? '#e7c875' : '#99aa87',
            4,
          );
      const target = state.waypoint || state.mission?.target;
      if (target && inScene(target, room.id)) {
        const p = projection.project(target.x, target.y);
        dot(g, p[0], p[1], '#e7c875', 5);
      }
      arrow(
        g,
        projection.project(state.player.x, state.player.y),
        state.player.angle || 0,
        '#eaf0d0',
        6,
      );
      return true;
    },
    stats() {
      return { cachedRooms: cache.size, ...counts };
    },
    dispose() {
      for (const key of [...cache.keys()]) release(key);
      disposed = true;
    },
  };
}
