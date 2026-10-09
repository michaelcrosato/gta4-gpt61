import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
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
export async function buildStaticSite({ source = process.cwd(), output = resolve('dist') } = {}) {
  const sourceRoot = resolve(source),
    outputRoot = resolve(output);
  const outputPrefix = outputRoot.endsWith(sep) ? outputRoot : outputRoot + sep;
  if (sourceRoot === outputRoot || sourceRoot.startsWith(outputPrefix))
    throw Error('Static output must not replace the source directory.');
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
