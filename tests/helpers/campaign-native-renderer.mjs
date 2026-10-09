/** Actual CPU-native render orchestration. Only the production renderer may
 * report clue visibility; saved state is checked unchanged after every frame.
 */
import { resolve, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

function crc(bytes) {
  let v = 0xffffffff;
  for (const b of bytes) {
    v ^= b;
    for (let i = 0; i < 8; i++) v = (v >>> 1) ^ (v & 1 ? 0xedb88320 : 0);
  }
  return (v ^ 0xffffffff) >>> 0;
}
function png(canvas) {
  const raw = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const src = (y * canvas.width + x) * 4,
        dst = y * (canvas.width * 4 + 1) + 1 + x * 4,
        a = canvas.pixels[src + 3];
      for (let c = 0; c < 3; c++)
        raw[dst + c] = Math.round(
          Math.max(0, Math.min(1, a ? canvas.pixels[src + c] / a : 0)) * 255,
        );
      raw[dst + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  const chunk = (name, data) => {
    const head = Buffer.from(name),
      size = Buffer.alloc(4),
      tail = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    tail.writeUInt32BE(crc(Buffer.concat([head, data])));
    return Buffer.concat([size, head, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.width, 0);
  header.writeUInt32BE(canvas.height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** RasterCanvas supplies the machine's tested pixel backing store. This adds
 * the Canvas2D subset needed by the ACTUAL native Renderer, without replacing
 * its actor queue, composite, depth sort, projection or clue-occlusion logic.
 * Unsupported vector/rotated paths throw rather than silently claiming a draw.
 */
function canvasClass(RasterCanvas, E, allocated) {
  return class NativeRasterCanvas extends RasterCanvas {
    constructor() {
      super();
      allocated.add(this);
      const g = this.g;
      let transform = [1, 0, 0, 1, 0, 0];
      const stack = [];
      const blend = (index, r, b, c, a) => {
        const p = this.pixels,
          op = g.globalCompositeOperation;
        if (op === 'source-over') {
          const inverse = 1 - a;
          p[index] = r + p[index] * inverse;
          p[index + 1] = b + p[index + 1] * inverse;
          p[index + 2] = c + p[index + 2] * inverse;
          p[index + 3] = a + p[index + 3] * inverse;
        } else if (op === 'source-in') {
          const d = p[index + 3];
          p[index] = r * d;
          p[index + 1] = b * d;
          p[index + 2] = c * d;
          p[index + 3] = a * d;
        } else if (op === 'destination-in' || op === 'destination-out') {
          const k = op === 'destination-in' ? a : 1 - a;
          for (let j = 0; j < 4; j++) p[index + j] *= k;
        } else if (op === 'lighter') {
          p[index] = Math.min(1, p[index] + r);
          p[index + 1] = Math.min(1, p[index + 1] + b);
          p[index + 2] = Math.min(1, p[index + 2] + c);
          p[index + 3] = Math.min(1, p[index + 3] + a);
        } else throw Error(`Unsupported native raster composite: ${op}`);
      };
      const rect = (x, y, w, h, fn) => {
        if (transform[1] || transform[2]) throw Error('Rotated raster transforms are unsupported.');
        let x0 = x * transform[0] + transform[4],
          x1 = (x + w) * transform[0] + transform[4],
          y0 = y * transform[3] + transform[5],
          y1 = (y + h) * transform[3] + transform[5];
        if (x1 < x0) [x0, x1] = [x1, x0];
        if (y1 < y0) [y0, y1] = [y1, y0];
        for (
          let row = Math.max(0, Math.floor(y0));
          row < Math.min(this.height, Math.ceil(y1));
          row++
        )
          for (
            let col = Math.max(0, Math.floor(x0));
            col < Math.min(this.width, Math.ceil(x1));
            col++
          )
            fn((row * this.width + col) * 4, col, row);
      };
      g.fillRect = (x, y, w, h) => {
        g.fills++;
        const rgb = E.hex(g.fillStyle),
          a = g.globalAlpha;
        rect(x, y, w, h, (index) =>
          blend(index, (rgb[0] / 255) * a, (rgb[1] / 255) * a, (rgb[2] / 255) * a, a),
        );
      };
      g.clearRect = (x, y, w, h) =>
        rect(x, y, w, h, (index) => this.pixels.fill(0, index, index + 4));
      g.drawImage = (source, ...args) => {
        let sx = 0,
          sy = 0,
          sw = source.width,
          sh = source.height,
          dx,
          dy,
          dw = sw,
          dh = sh;
        if (args.length === 2) [dx, dy] = args;
        else if (args.length === 4) [dx, dy, dw, dh] = args;
        else if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args;
        else throw Error('Invalid native raster drawImage.');
        if (!source.pixels) throw Error('Native renderer needs a raster pixel source.');
        const data = source === this ? source.pixels.slice() : source.pixels,
          a = g.globalAlpha;
        rect(dx, dy, dw, dh, (index, col, row) => {
          const ux = ((col + 0.5 - transform[4]) / transform[0] - dx) / dw,
            uy = ((row + 0.5 - transform[5]) / transform[3] - dy) / dh,
            px = Math.floor(sx + ux * sw),
            py = Math.floor(sy + uy * sh);
          if (px < 0 || py < 0 || px >= source.width || py >= source.height) return;
          const at = (py * source.width + px) * 4;
          blend(index, data[at] * a, data[at + 1] * a, data[at + 2] * a, data[at + 3] * a);
        });
      };
      g.save = () =>
        stack.push({
          transform: [...transform],
          fillStyle: g.fillStyle,
          globalAlpha: g.globalAlpha,
          globalCompositeOperation: g.globalCompositeOperation,
          _c: g._c,
        });
      g.restore = () => {
        const old = stack.pop();
        if (!old) throw Error('Unbalanced native raster restore.');
        transform = old.transform;
        Object.assign(g, old);
      };
      g.getTransform = () => ({
        a: transform[0],
        b: transform[1],
        c: transform[2],
        d: transform[3],
        e: transform[4],
        f: transform[5],
      });
      g.setTransform = (a, b, c, d, e, f) => {
        transform = [a, b, c, d, e, f];
      };
      g.resetTransform = () => {
        transform = [1, 0, 0, 1, 0, 0];
      };
      g.translate = (x, y) => {
        transform[4] += transform[0] * x;
        transform[5] += transform[3] * y;
      };
      g.scale = (x, y) => {
        transform[0] *= x;
        transform[3] *= y;
      };
      g.createImageData = (width, height) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      });
      g.putImageData = (image, dx, dy) => {
        for (let y = 0; y < image.height; y++)
          for (let x = 0; x < image.width; x++) {
            const tx = dx + x,
              ty = dy + y;
            if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
            const src = (y * image.width + x) * 4,
              dst = (ty * this.width + tx) * 4,
              a = image.data[src + 3] / 255;
            for (let c = 0; c < 3; c++) this.pixels[dst + c] = (image.data[src + c] / 255) * a;
            this.pixels[dst + 3] = a;
          }
      };
      g.getImageData = (sx, sy, width, height) => {
        const image = g.createImageData(width, height);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const tx = sx + x,
              ty = sy + y;
            if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
            const src = (ty * this.width + tx) * 4,
              dst = (y * width + x) * 4,
              a = this.pixels[src + 3];
            for (let c = 0; c < 3; c++)
              image.data[dst + c] = Math.round((a ? this.pixels[src + c] / a : 0) * 255);
            image.data[dst + 3] = Math.round(a * 255);
          }
        return image;
      };
      for (const name of [
        'fill',
        'stroke',
        'fillText',
        'strokeText',
        'beginPath',
        'rect',
        'clip',
        'rotate',
        'createPattern',
      ])
        g[name] = () => {
          throw Error(`Unsupported native raster path: ${name}`);
        };
    }
  };
}

export async function createJourneyRenderer(sourceRoot, options = {}) {
  sourceRoot = resolve(sourceRoot);
  const load = (file) => import(pathToFileURL(join(sourceRoot, file)).href);
  await load('my-3d2dge.js');
  const [
    { RasterCanvas },
    { createWorldRenderer },
    { createInteriorRenderer },
    { createLateMeterRenderer },
    { createNightCrossingRenderer },
    simulation,
    companions,
  ] = await Promise.all([
    load('tests/helpers/raster-canvas.mjs'),
    load('src/renderer.js'),
    load('src/interior-renderer.js'),
    load('src/campaign/late-meter-scenes.js'),
    load('src/campaign/scenes.js'),
    load('src/simulation.js'),
    load('src/companions.js'),
  ]);
  const E = globalThis.My3D2dge,
    allocated = new Set(),
    Canvas = canvasClass(RasterCanvas, E, allocated),
    width = options.width ?? 1000,
    height = options.height ?? 670;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 100 ||
    height < 100 ||
    width > 2000 ||
    height > 1400
  )
    throw Error('Invalid journey raster dimensions.');
  const withDocument = (fn) => {
    const before = globalThis.document;
    globalThis.document = {
      createElement(name) {
        if (name !== 'canvas') throw Error(`Unexpected native element: ${name}`);
        return new Canvas();
      },
    };
    try {
      return fn();
    } finally {
      if (before === undefined) delete globalThis.document;
      else globalThis.document = before;
    }
  };
  let currentState = null,
    disposed = false,
    frames = 0,
    lastProofs = [],
    lastFrame = null;
  const canvas = new Canvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d'),
    game = {
      time: 0,
      real: 0,
      view: new E.View('city', 'City', 35, 48, 1.1, 1),
      o: { bg: '#16231f' },
      stats: { actors: 0, culled: 0, items: 0 },
      lights: { enabled: false, add() {}, clear() {} },
      screen: {
        ctx,
        buf: canvas,
        W: width,
        H: height,
        begin(cx, cy, bg) {
          this.ix = Math.floor(cx);
          this.iy = Math.floor(cy);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx._c = null;
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, width, height);
        },
        present() {},
      },
    };
  game.particles = new E.Particles(game);
  const native = withDocument(() => new E.Renderer(game));
  const scene = withDocument(() =>
      createLateMeterRenderer(game, simulation.WORLD, {
        getActor: (id) => companions.getActor(currentState, id),
      }),
    ),
    night = withDocument(() => createNightCrossingRenderer(game, simulation.WORLD));
  const record = (state, actor, clues) => {
    if (state !== currentState) throw Error('Clue rendering lost authoritative state identity.');
    simulation.recordStoryRenderedClues(state, actor, clues);
    lastProofs.push({
      actorId: actor.id,
      clues: [...clues],
      at: state.time,
      pose: { x: actor.x, y: actor.y, z: actor.z ?? 0, sceneId: actor.sceneId ?? null },
      screen: native.w(actor.x, actor.y, (actor.z ?? 0) + 16),
    });
  };
  const world = withDocument(() =>
    createWorldRenderer(game, simulation.WORLD, simulation.VEHICLE_SPECS, {
      afterGround: (r, s) => {
        night.drawGround(r, s);
        scene.drawGround(r, s);
      },
      afterScenery: (r, s) => {
        night.draw(r, s);
        scene.draw(r, s);
      },
      onRenderedClues: record,
    }),
  );
  const interior = withDocument(() =>
    createInteriorRenderer(game, simulation.VEHICLE_SPECS, {
      drawRoomDetails: (r, s) => scene.drawRoomDetails(r, s),
      onRenderedClues: record,
    }),
  );
  const sourceHashes = Object.fromEntries(
    [
      'my-3d2dge.js',
      'tests/helpers/raster-canvas.mjs',
      'src/renderer.js',
      'src/interior-renderer.js',
      'src/campaign/late-meter-scenes.js',
      'src/simulation.js',
    ].map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(join(sourceRoot, file)))
        .digest('hex'),
    ]),
  );
  function artifact(path) {
    path = resolve(path);
    if (!path.startsWith('/tmp/')) throw Error('Journey artifacts must be under /tmp.');
    mkdirSync(resolve(path, '..'), { recursive: true });
    if (extname(path) === '.png') writeFileSync(path, png(canvas));
    else if (extname(path) === '.ppm') {
      const raw = Buffer.alloc(width * height * 3);
      for (let i = 0; i < width * height; i++)
        for (let c = 0; c < 3; c++)
          raw[i * 3 + c] = Math.round(Math.max(0, Math.min(1, canvas.pixels[i * 4 + c])) * 255);
      writeFileSync(path, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), raw]));
    } else throw Error('Journey raster supports .png or .ppm artifacts.');
    return path;
  }
  return {
    draw(state, { outputPath = options.outputPath } = {}) {
      if (disposed) throw Error('Journey renderer is disposed.');
      const before = JSON.stringify(state);
      currentState = state;
      lastProofs = [];
      game.time = state.time;
      game.real = state.time;
      const focused = simulation.currentVehicle(state) ?? state.player,
        anchor = game.view.p(focused.x, focused.y, focused.z ?? 0);
      withDocument(() => {
        native.begin(anchor[0] - width / 2, anchor[1] - height / 2);
        if (state.interior?.active) interior.draw(native, state);
        else world.draw(native, state, { rain: false });
        native.finish();
      });
      if (JSON.stringify(state) !== before)
        throw Error('Native renderer changed saved world state.');
      frames++;
      lastFrame = {
        frame: frames,
        time: state.time,
        width,
        height,
        camera: {
          yaw: 35,
          pitch: 48,
          zoom: 1.1,
          focus: { x: focused.x, y: focused.y, z: focused.z ?? 0 },
          ix: native.ix,
          iy: native.iy,
        },
        nativeStats: { ...game.stats },
        proofs: lastProofs.map((p) => ({ ...p, clues: [...p.clues] })),
        artifact:
          outputPath || options.output
            ? artifact(
                outputPath ??
                  join(
                    resolve(options.output),
                    `native-frame-${String(frames).padStart(4, '0')}.png`,
                  ),
              )
            : null,
      };
      return lastFrame;
    },
    get stats() {
      return {
        frames,
        lastFrame,
        world: world.stats,
        scene: scene.stats,
        sourceHashes,
        boundary:
          'Actual native CPU Renderer/actor flush and saved-state scene draw; lighting disabled, no browser/UI or mission-completion claim.',
      };
    },
    export: artifact,
    dispose() {
      if (disposed) return;
      world.dispose();
      interior.dispose();
      scene.dispose();
      night.dispose?.();
      for (const cv of allocated) {
        cv.width = 0;
        cv.height = 0;
      }
      allocated.clear();
      disposed = true;
      currentState = null;
    },
  };
}
