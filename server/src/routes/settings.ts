import { Router } from 'express';
import type { DB } from '../db.js';
import { h, HttpError } from '../http.js';
import { getOllamaConfig, isValidOllamaUrl, setSetting } from '../ollama.js';

export function settingsRouter(db: DB): Router {
  const r = Router();

  const view = () => {
    const c = getOllamaConfig(db);
    return { ollamaUrl: c.url, ollamaModel: c.model, ollamaUrlSource: c.urlSource, ollamaModelSource: c.modelSource };
  };

  r.get('/settings', h((_req, res) => res.json(view())));

  r.put(
    '/settings',
    h((req, res) => {
      const { ollamaUrl, ollamaModel } = req.body ?? {};
      if (ollamaUrl !== undefined) {
        if (typeof ollamaUrl !== 'string') throw new HttpError(400, 'ollamaUrl muss Text sein');
        const v = ollamaUrl.trim();
        if (v && !isValidOllamaUrl(v)) throw new HttpError(400, 'ollamaUrl muss mit http:// oder https:// beginnen');
        setSetting(db, 'ollama_url', v);
      }
      if (ollamaModel !== undefined) {
        if (typeof ollamaModel !== 'string' || ollamaModel.length > 200) throw new HttpError(400, 'ollamaModel ungültig');
        setSetting(db, 'ollama_model', ollamaModel.trim());
      }
      res.json(view());
    }),
  );

  return r;
}
