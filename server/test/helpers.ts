import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

export function setup() {
  const db = openDb(':memory:');
  const app = createApp(db);
  const api = request(app);
  return { db, app, api };
}

export function block(content: string, indent = 0) {
  return { id: randomUUID(), indent, content };
}
