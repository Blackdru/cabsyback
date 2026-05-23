import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

type Source = 'body' | 'params' | 'query';

interface ValidationError extends Error {
  statusCode: number;
  code: string;
  details: unknown;
}

export function validate<T>(schema: ZodSchema<T>, source: Source = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const err: ValidationError = Object.assign(new Error('Invalid request'), {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: result.error.flatten(),
      });
      next(err);
      return;
    }
    // Replace the raw input with the parsed/typed value so downstream handlers
    // see the validated shape. Express types req[source] as their own shapes,
    // so a single targeted cast is necessary here.
    (req as any)[source] = result.data;
    next();
  };
}
