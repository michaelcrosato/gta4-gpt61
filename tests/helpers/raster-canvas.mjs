import assert from 'node:assert/strict';
import '../../my-3d2dge.js';
const E = globalThis.My3D2dge;
export const canvases = [];

export class RasterCanvas {
  constructor() {
    this._width = 0;
    this._height = 0;
    this.pixels = new Float64Array(0);
    this.g = new RasterContext(this);
    canvases.push(this);
  }
  get width() {
    return this._width;
  }
  set width(value) {
    this._width = value;
    this.resize();
  }
  get height() {
    return this._height;
  }
  set height(value) {
    this._height = value;
    this.resize();
  }
  resize() {
    this.pixels = new Float64Array(this._width * this._height * 4);
  }
  getContext() {
    return this.g;
  }
}
export class RasterContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.filter = 'none';
    this.shadowBlur = 0;
    this.shadowOffsetX = 0;
    this.shadowOffsetY = 0;
    this.images = [];
    this.fills = 0;
  }
  getTransform() {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
  fillRect(x, y, w, h) {
    this.fills++;
    const color = E.hex(this.fillStyle).map((value) => value / 255),
      alpha = this.globalAlpha;
    const pixels = this.canvas.pixels,
      width = this.canvas.width,
      height = this.canvas.height;
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row++)
      for (let column = Math.max(0, x); column < Math.min(width, x + w); column++) {
        const index = (row * width + column) * 4;
        for (let channel = 0; channel < 3; channel++)
          pixels[index + channel] = color[channel] * alpha + pixels[index + channel] * (1 - alpha);
        pixels[index + 3] = alpha + pixels[index + 3] * (1 - alpha);
      }
  }
  drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh) {
    assert.equal(arguments.length, 9, 'floor drawImage must crop its source explicitly');
    assert.equal(dw, sw);
    assert.equal(dh, sh);
    this.images.push({ source, sx, sy, sw, sh, dx, dy, dw, dh });
    for (let row = 0; row < sh; row++)
      for (let column = 0; column < sw; column++) {
        const targetX = dx + column,
          targetY = dy + row;
        if (
          targetX < 0 ||
          targetX >= this.canvas.width ||
          targetY < 0 ||
          targetY >= this.canvas.height
        )
          continue;
        const from = ((sy + row) * source.width + sx + column) * 4,
          to = (targetY * this.canvas.width + targetX) * 4;
        const alpha = source.pixels[from + 3] * this.globalAlpha;
        for (let channel = 0; channel < 3; channel++)
          this.canvas.pixels[to + channel] =
            source.pixels[from + channel] * this.globalAlpha +
            this.canvas.pixels[to + channel] * (1 - alpha);
        this.canvas.pixels[to + 3] = alpha + this.canvas.pixels[to + 3] * (1 - alpha);
      }
  }
}
