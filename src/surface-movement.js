/** Small collision steps follow connected ramps without selecting an unrelated deck. */
export function createSurfaceMovement(terrain) {
  function moveBody(body, dx, dy, radius, { allowWater = false } = {}) {
    const mode = body.spec ? 'car' : 'foot';
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (radius * 0.65)));
    let collided = false;
    body.groundZ ??= terrain.surfaceHeight(body.x, body.y, body.z || 0, { mode });
    body.z ??= body.groundZ;
    function step(x, y) {
      const floor = terrain.surfaceHeight(x, y, body.groundZ, { mode });
      const difference = floor - body.groundZ;
      // Tunnel walls and bridge vehicle barriers keep bodies on their own layer.
      if ((body.groundZ < -1 && difference > 6) || (mode === 'car' && difference < -6))
        return false;
      const grounded = Math.abs(body.z - body.groundZ) < 0.1 && !(body.vz > 0);
      const z = grounded && difference >= -6 ? body.z + difference : body.z;
      if (terrain.isBlocked(x, y, radius, z, { ignoreWater: allowWater })) return false;
      body.x = x;
      body.y = y;
      body.z = z;
      body.groundZ = floor;
      return true;
    }
    for (let i = 0; i < steps; i++) {
      const x = body.x + dx / steps,
        y = body.y + dy / steps;
      if (step(x, y)) continue;
      collided = true;
      step(x, body.y);
      step(body.x, y);
    }
    return collided;
  }
  return { moveBody };
}
