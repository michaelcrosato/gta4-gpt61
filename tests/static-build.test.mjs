import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildStaticSite } from '../scripts/build.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...(await files(root, path)));
    else result.push(path);
  }
  return result.sort();
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const execute = promisify(execFile);

test('the production static artifact contains the complete byte-identical browser graph and no development payload', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'lowlight-static-build-')),
    output = join(temp, 'public');
  try {
    await buildStaticSite({ source, output });
    await writeFile(join(output, 'obsolete.js'), 'old deployment');
    await buildStaticSite({ source, output });
    const published = await files(output),
      html = await readFile(join(output, 'index.html'), 'utf8');
    assert(!published.includes('obsolete.js'), 'build removes obsolete public files');
    assert(published.includes('LICENSES/my-3d2dge.txt'));
    for (const path of published) {
      assert(!/^(tests|docs|scripts|node_modules|\.git)(\/|$)/.test(path), path);
      assert.equal(
        hash(await readFile(join(output, path))),
        hash(await readFile(join(source, path))),
        path,
      );
    }
    const pending = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]),
      seen = new Set();
    while (pending.length) {
      const path = pending.pop();
      if (seen.has(path) || /^[a-z]+:/i.test(path)) continue;
      assert(!path.startsWith('..'), path);
      assert(published.includes(path), 'Missing published dependency ' + path);
      seen.add(path);
      if (path.endsWith('.js')) {
        const code = await readFile(join(output, path), 'utf8');
        for (const match of code.matchAll(
          /\bfrom\s+['"](\.[^'"]+)['"]|\bimport\s+['"](\.[^'"]+)['"]/g,
        ))
          pending.push(join(dirname(path), match[1] ?? match[2]));
        assert(!/\bfrom\s+['"]node:/.test(code), 'Browser module needs server APIs: ' + path);
      }
    }
    assert(seen.has('src/campaign/late-meter-runtime.js'), 'the actual campaign graph is deployed');
    assert(seen.has('src/campaign/history/first-arc-0.5.js'), 'old-save compatibility is deployed');
    const manifest = JSON.parse(await readFile(join(output, 'manifest.webmanifest'), 'utf8'));
    for (const icon of manifest.icons) assert(published.includes(icon.src));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('a static output cannot erase its source tree', async () => {
  await assert.rejects(buildStaticSite({ source, output: source }), /must not replace/);
  await assert.rejects(
    buildStaticSite({ source, output: resolve(source, '..') }),
    /must not replace/,
  );
  await assert.rejects(buildStaticSite({ source, output: resolve('/') }), /must not replace/);
});

test('static output rejects public input overlap and symlink aliases before removing files', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'lowlight-build-paths-')),
    fixture = join(temp, 'actual', 'source'),
    alias = join(temp, 'alias'),
    inputs = [
      'index.html',
      'styles.css',
      'my-3d2dge.js',
      'manifest.webmanifest',
      'src/keep.js',
      'assets/keep.txt',
      'LICENSES/keep.txt',
    ];
  try {
    for (const file of inputs) {
      await mkdir(dirname(join(fixture, file)), { recursive: true });
      await writeFile(join(fixture, file), `original:${file}`);
    }
    await symlink(dirname(fixture), alias, 'dir');
    for (const output of [
      join(fixture, 'src'),
      join(fixture, 'src', 'generated'),
      join(fixture, 'assets'),
      join(fixture, 'index.html'),
      join(alias, 'source'),
      join(alias, 'source', 'src', 'generated'),
    ]) {
      await assert.rejects(buildStaticSite({ source: fixture, output }), /must not replace/);
      assert.deepEqual(await files(fixture), inputs.toSorted());
      for (const file of inputs)
        assert.equal(await readFile(join(fixture, file), 'utf8'), `original:${file}`);
    }
    const output = join(alias, 'source', 'dist');
    assert.equal(await buildStaticSite({ source: fixture, output }), output);
    for (const file of inputs)
      assert.equal(await readFile(join(output, file), 'utf8'), `original:${file}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('the actual Vercel build command produces its configured public output without installed dependencies', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8')),
    temp = await mkdtemp(join(tmpdir(), 'lowlight-vercel-contract-'));
  try {
    await buildStaticSite({ source, output: temp + '/input' });
    await mkdir(join(temp, 'input/scripts'));
    await Promise.all(
      ['package.json', 'package-lock.json', 'scripts/build.mjs'].map((file) =>
        cp(join(source, file), join(temp, 'input', file)),
      ),
    );
    const [command, ...args] = config.buildCommand.split(/\s+/);
    await execute(command, args, { cwd: join(temp, 'input') });
    const output = join(temp, 'input', config.outputDirectory);
    assert.equal(
      await readFile(join(output, 'index.html'), 'utf8'),
      await readFile(join(source, 'index.html'), 'utf8'),
    );
    assert((await files(output)).includes('src/game.js'));
    assert.equal(config.framework, null, 'static game uses the Other preset');
    assert.equal(config.rewrites, undefined, 'missing assets retain real404 responses');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
