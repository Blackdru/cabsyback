import type { Request, RequestHandler, Response } from 'express';
import rateLimit, { type ValueDeterminingMiddleware } from 'express-rate-limit';

// In-memory store: only sound on a single backend replica. If you ever scale
// horizontally, swap this for a shared store (Postgres-backed via
// rate-limit-postgres, or similar).

const RATE_LIMITED_BODY = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests' },
} as const;

function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json(RATE_LIMITED_BODY);
}

interface BuildLimiterOptions {
  windowMs: number;
  limit: number;
  keyGenerator: ValueDeterminingMiddleware<string>;
}

function buildLimiter(opts: BuildLimiterOptions): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: opts.keyGenerator,
  });
}

function ipKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// Per-IP+phone — stops one number being hammered from a single IP.
export const otpRequestLimiter: RequestHandler = buildLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => {
    const body = req.body as { phone?: unknown } | undefined;
    const phone = typeof body?.phone === 'string' ? body.phone : 'no-phone';
    return `${ipKey(req)}|${phone}`;
  },
});

export const otpVerifyLimiter: RequestHandler = buildLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => ipKey(req),
});

export const refreshLimiter: RequestHandler = buildLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => ipKey(req),
});

export const apiLimiter: RequestHandler = buildLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: (req) => ipKey(req),
});
