import { logger } from '../config/logger';
import { pruneStaleDrivers } from '../services/geo';
import { LOCK_STALE_DRIVERS, withAdvisoryLock } from './lock';

export async function pruneStaleDriversOnce(): Promise<number> {
  // Advisory lock: only one instance prunes at a time across the cluster.
  const removed = await withAdvisoryLock(LOCK_STALE_DRIVERS, () => pruneStaleDrivers());
  if (removed && removed > 0) {
    logger.debug({ removed }, 'staleDrivers tick removed entries');
  }
  return removed ?? 0;
}

export function startStaleDriverJob(intervalMs: number = 15000): NodeJS.Timeout {
  return setInterval(() => {
    const startedAt = Date.now();
    void pruneStaleDriversOnce()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ err: message }, 'staleDrivers tick failed');
      })
      .finally(() => {
        const took = Date.now() - startedAt;
        if (took > intervalMs) {
          logger.warn({ took, intervalMs }, 'staleDrivers tick exceeded interval');
        }
      });
  }, intervalMs);
}

export function stopStaleDriverJob(handle: NodeJS.Timeout): void {
  clearInterval(handle);
}
