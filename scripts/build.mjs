import { cp, mkdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const publicFiles = [
  'index.html',
  'styles.css',
  'src',
  'my-3d2dge.js',
  'manifest.webmanifest',
  'assets',
  'LICENSES',
];
const within = (path, root) =>
  path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

async function canonicalPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    const parent = dirname(path);
    if (error.code !== 'ENOENT' || parent === path) throw error;
    return resolve(await canonicalPath(parent), basename(path));
  }
}

export async function buildStaticSite({ source = process.cwd(), output = resolve('dist') } = {}) {
  const sourceRoot = await realpath(resolve(source)),
    outputRoot = resolve(output),
    physicalOutput = await canonicalPath(outputRoot),
    inputs = await Promise.all(publicFiles.map((file) => realpath(resolve(sourceRoot, file))));
  if (
    within(sourceRoot, physicalOutput) ||
    inputs.some((input) => within(physicalOutput, input) || within(input, physicalOutput))
  )
    throw Error('Static output must not replace the source directory or overlap a public input.');
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await Promise.all(
    publicFiles.map((file) =>
      cp(resolve(sourceRoot, file), resolve(outputRoot, file), { recursive: true }),
    ),
  );
  return outputRoot;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildStaticSite();
  console.log('Built LOWLIGHT into dist/. Serve this folder with a static HTTP server.');
}
