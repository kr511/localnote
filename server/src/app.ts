import express from 'express';
import type { DB } from './db.js';
import { errorHandler } from './http.js';
import { subjectsRouter } from './routes/subjects.js';
import { pagesRouter } from './routes/pages.js';
import { studyRouter } from './routes/study.js';
import { searchRouter } from './routes/search.js';

export function createApp(db: DB) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  api.use(subjectsRouter(db));
  api.use(pagesRouter(db));
  api.use(studyRouter(db));
  api.use(searchRouter(db));
  api.use((_req, res) => {
    res.status(404).json({ error: 'Unbekannter Endpunkt' });
  });

  app.use('/api', api);
  app.use(errorHandler);
  return app;
}
