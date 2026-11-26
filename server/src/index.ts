import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbFile = process.env.LOCALNOTE_DB ?? path.join(root, 'localnote.db');
const port = Number(process.env.PORT ?? 3001);

const db = openDb(dbFile);
const app = createApp(db);

// In production the built client is served from the same origin.
const dist = path.join(root, 'client', 'dist');
const serveClient = process.argv.includes('--serve-client') && fs.existsSync(dist);
if (serveClient) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Bind to localhost only: this app has no auth and must not be reachable from the network.
app.listen(port, '127.0.0.1', () => {
  console.log(`LocalNote API läuft auf http://localhost:${port}  (DB: ${dbFile})`);
  if (serveClient) console.log(`\n  ➜  App öffnen: http://localhost:${port}\n`);
});
