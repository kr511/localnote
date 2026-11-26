// Bundles the Electron main process + the Express server into dist/main.cjs
// and copies the built web UI (client/dist) next to it.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../client/dist');
if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error('client/dist fehlt. Erst im Repo-Root "npm run build" ausführen.');
  process.exit(1);
}

fs.rmSync(path.join(here, 'dist'), { recursive: true, force: true });
await build({
  entryPoints: [path.join(here, 'src/main.ts')],
  outfile: path.join(here, 'dist/main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // native module + electron itself are provided at runtime
  external: ['electron', 'better-sqlite3'],
  logLevel: 'info',
});
fs.cpSync(clientDist, path.join(here, 'dist/client'), { recursive: true });
console.log('desktop/dist fertig');
