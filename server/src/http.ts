import type { Request, Response, NextFunction, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function intParam(req: Request, name: string): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Ungültige ${name}`);
  return n;
}

export function requireString(value: unknown, field: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${field} fehlt`);
  if (value.length > max) throw new HttpError(400, `${field} ist zu lang`);
  return value.trim();
}

export function notFound(what: string): HttpError {
  return new HttpError(404, `${what} nicht gefunden`);
}

/** Wraps sync or async handlers so thrown errors reach the error middleware. */
export const h =
  (fn: (req: Request, res: Response) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ error: 'Ungültiges JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Interner Fehler' });
}
