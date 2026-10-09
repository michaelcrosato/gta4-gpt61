import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function gameModules(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory())
      files.push(
        ...(await gameModules(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`)),
      );
    else if (entry.name.endsWith('.js')) files.push(`${prefix}${entry.name}`);
  }
  return files;
}
const files = (await gameModules(new URL('../src/', import.meta.url))).sort();
for (const file of files) {
  const result = spawnSync(
    process.execPath,
    ['--check', fileURLToPath(new URL(`../src/${file}`, import.meta.url))],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} game modules.`);
