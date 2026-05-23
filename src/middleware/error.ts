import type { ErrorRequestHandler } from 'express';
import { logger } from '../config/logger';
import { env } from '../config/env';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const e = err as AppError;
  const status = typeof e.statusCode === 'number' ? e.statusCode : 500;
  const code = typeof e.code === 'string' && e.code.length > 0 ? e.code : 'INTERNAL_ERROR';
  const message = e.message || 'Internal server error';

  logger.error(
    {
      err: { message: e.message, code, status, stack: e.stack },
      method: req.method,
      url: req.url,
    },
    'request error',
  );

  const body: { error: { code: string; message: string; details?: unknown } } = {
    error: { code, message },
  };

  if (env.NODE_ENV !== 'production' && e.details !== undefined) {
    body.error.details = e.details;
  }

  res.status(status).json(body);
};
