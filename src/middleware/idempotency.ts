import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/client';
import { logger } from '../config/logger';

// Idempotency-Key header support (Stripe-style). Clients SHOULD include a
// UUID in `Idempotency-Key` on POST /rides (and similar mutating endpoints
// where retries are likely). Backend stores the (user, key) -> response in
// `idempotency_keys` for 24h. A repeat request within that window returns
// the cached response without re-running the handler.
//
// The request_hash check protects against a misbehaving client reusing the
// same key for two semantically different requests — we 409 in that case.

const HEADER = 'idempotency-key';

interface CachedRow {
  request_hash: string;
  response: unknown;
  status_code: number;
}

function hashRequest(method: string, path: string, body: unknown): string {
  const payload = JSON.stringify({ method, path, body });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function idempotency(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.header(HEADER);
  if (!key) {
    next();
    return;
  }
  const userId = req.user?.userId;
  if (!userId) {
    // No auth context yet — should not happen if mounted after requireAuth.
    next();
    return;
  }

  const requestHash = hashRequest(req.method, req.path, req.body);

  try {
    const { rows } = await pool.query<CachedRow>(
      `SELECT request_hash, response, status_code
       FROM idempotency_keys
       WHERE user_id = $1 AND key = $2 AND expires_at > now()`,
      [userId, key],
    );
    const cached = rows[0];
    if (cached) {
      if (cached.request_hash !== requestHash) {
        res.status(409).json({
          error: {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency-Key already used with a different request body',
          },
        });
        return;
      }
      // Cache hit — replay the original response.
      res.status(cached.status_code).json(cached.response);
      return;
    }
  } catch (err) {
    // If the cache lookup fails (DB blip), fail open: proceed with the
    // request rather than 503'ing a happy-path booking.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, userId }, 'idempotency cache lookup failed');
    next();
    return;
  }

  // Wrap res.json so we can persist the response after the handler resolves.
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const statusCode = res.statusCode;
    // Only cache 2xx — don't memoize transient errors.
    if (statusCode >= 200 && statusCode < 300) {
      pool
        .query(
          `INSERT INTO idempotency_keys (user_id, key, request_hash, response, status_code)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, key) DO NOTHING`,
          [userId, key, requestHash, body, statusCode],
        )
        .catch((err: unknown) => {
          const m = err instanceof Error ? err.message : String(err);
          logger.warn({ err: m, userId }, 'idempotency cache write failed');
        });
    }
    return originalJson(body);
  }) as Response['json'];

  next();
}
