import { mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const dest = 'public/vendor';
await mkdir(dest, { recursive: true });
for (const name of await readdir('node_modules/web-ifc')) {
  if (name.endsWith('.wasm')) await copyFile(path.join('node_modules/web-ifc', name), path.join(dest, name));
}
await copyFile('node_modules/@thatopen/fragments/dist/Worker/worker.mjs', path.join(dest, 'fragments-worker.mjs'));
