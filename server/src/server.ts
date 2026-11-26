import path from 'node:path';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { openDb } from './db.js';
import { createApp } from './app.js';

export interface StartOptions {
  dbFile: string;
  /** 0 = pick a free port */
  port: number;
  /** built client (client/dist) to serve on the same origin, optional */
  clientDir?: string;
}

/** Starts the API (and optionally the built UI) on 127.0.0.1. Used by the CLI and the desktop app. */
export function startServer(opts: StartOptions): Promise<{ port: number; close: () => void }> {
  const db = openDb(opts.dbFile);
  const app = createApp(db);

  if (opts.clientDir && fs.existsSync(opts.clientDir)) {
    const dir = opts.clientDir;
    app.use(express.static(dir));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dir, 'index.html')));
  }

  return new Promise((resolve, reject) => {
    // Bind to localhost only: this app has no auth and must not be reachable from the network.
    const server = app.listen(opts.port, '127.0.0.1', () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => {
          server.close();
          db.close();
        },
      });
    });
    server.on('error', reject);
  });
}
