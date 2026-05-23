import { pool } from '../db/client';
import { logger } from '../config/logger';
import { getIo } from '../realtime/socket';
import { Rooms, ServerEvents } from '../shared/events';
import type { RideExpiredPayload } from '../shared/types';
import { sendNotification } from '../services/push';
import { LOCK_BID_WINDOW, withAdvisoryLock } from './lock';

interface ExpiredRide {
  rideId: string;
  riderId: string;
  bidCount: number;
}

export async function expireBiddingRidesOnce(): Promise<number> {
  // Advisory lock: at most one instance runs this section at a time.
  // Other instances skip — the next tick will retry safely.
  const result = await withAdvisoryLock(LOCK_BID_WINDOW, () => doExpireBiddingRides());
  return result ?? 0;
}

async function doExpireBiddingRides(): Promise<number> {
  logger.debug('bidWindow tick start');

  const now = new Date();
  const { rows: due } = await pool.query<{ id: string; rider_id: string }>(
    `SELECT id, rider_id FROM rides
     WHERE status = 'bidding' AND bidding_ends_at < $1`,
    [now],
  );

  if (due.length === 0) {
    logger.debug({ expired: 0 }, 'bidWindow tick end');
    return 0;
  }

  const expired: ExpiredRide[] = [];

  for (const candidate of due) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Re-check status under the transaction to avoid racing with rider:acceptBid
      // (which sets status=assigned) or with any other expiry tick.
      const fresh = await client.query<{ id: string; status: string; rider_id: string }>(
        `SELECT id, status, rider_id FROM rides WHERE id = $1 LIMIT 1`,
        [candidate.id],
      );
      const row = fresh.rows[0];
      if (!row || row.status !== 'bidding') {
        await client.query('COMMIT');
        continue;
      }

      // Count bids inside the same tx so the no_bids/no_acceptance reason
      // accurately reflects the world at expiry time.
      const countRes = await client.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM bids WHERE ride_id = $1`,
        [candidate.id],
      );
      const bidCount = countRes.rows[0]?.c ?? 0;

      await client.query(
        `UPDATE rides SET status = 'expired' WHERE id = $1`,
        [candidate.id],
      );
      await client.query(
        `UPDATE bids SET status = 'expired'
         WHERE ride_id = $1 AND status = 'active'`,
        [candidate.id],
      );

      await client.query('COMMIT');
      expired.push({ rideId: row.id, riderId: row.rider_id, bidCount });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message, rideId: candidate.id }, 'failed to expire ride');
    } finally {
      client.release();
    }
  }

  if (expired.length > 0) {
    try {
      const io = getIo();
      for (const e of expired) {
        const reason: RideExpiredPayload['reason'] =
          e.bidCount === 0 ? 'no_bids' : 'no_acceptance';
        const payload: RideExpiredPayload = { rideId: e.rideId, reason };
        io.to(Rooms.ride(e.rideId)).emit(ServerEvents.RideExpired, payload);
        io.to(Rooms.user(e.riderId)).emit(ServerEvents.RideExpired, payload);

        void sendNotification(e.riderId, {
          title: reason === 'no_bids' ? 'No drivers available' : 'Bidding ended',
          body:
            reason === 'no_bids'
              ? 'Please try again.'
              : 'No bid was accepted in time.',
          data: { rideId: e.rideId },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message }, 'failed to broadcast ride expiry');
    }
  }

  logger.debug({ expired: expired.length }, 'bidWindow tick end');
  return expired.length;
}

export function startBidWindowJob(intervalMs: number = 5000): NodeJS.Timeout {
  return setInterval(() => {
    const startedAt = Date.now();
    void expireBiddingRidesOnce()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ err: message }, 'bidWindow tick failed');
      })
      .finally(() => {
        const took = Date.now() - startedAt;
        if (took > intervalMs) {
          logger.warn({ took, intervalMs }, 'bidWindow tick exceeded interval');
        }
      });
  }, intervalMs);
}

export function stopBidWindowJob(handle: NodeJS.Timeout): void {
  clearInterval(handle);
}
