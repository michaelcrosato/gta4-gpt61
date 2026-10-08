import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of [
  'index.html',
  'styles.css',
  'src',
  'my-3d2dge.js',
  'manifest.webmanifest',
  'assets',
  'LICENSES',
]) {
  await cp(file, `${output}/${file}`, { recursive: true });
}
console.log('Built LOWLIGHT into dist/. Serve this folder with a static HTTP server.');
