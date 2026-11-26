import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbFile = process.env.LOCALNOTE_DB ?? path.join(root, 'localnote.db');
const serveClient = process.argv.includes('--serve-client');

const { port } = await startServer({
  dbFile,
  port: Number(process.env.PORT ?? 3001),
  clientDir: serveClient ? path.join(root, 'client', 'dist') : undefined,
});

console.log(`LocalNote API läuft auf http://localhost:${port}  (DB: ${dbFile})`);
if (serveClient) console.log(`\n  ➜  App öffnen: http://localhost:${port}\n`);
