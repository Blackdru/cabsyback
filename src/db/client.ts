import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  // Per-statement timeout enforced by Postgres so a slow query can't block
  // a connection indefinitely and exhaust the pool. Tunable for analytics-style
  // aggregates (getEarnings) and dispatch jobs.
  statement_timeout: env.PG_STATEMENT_TIMEOUT_MS,
});

pool.on('error', (err) => {
  logger.warn({ err: err.message }, 'pg pool error');
});

void (async () => {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      logger.info({ poolMax: env.PG_POOL_MAX }, 'postgres connected');
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, 'postgres initial connection failed; continuing without db');
  }
})();
