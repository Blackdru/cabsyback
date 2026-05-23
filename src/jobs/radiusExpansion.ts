import { pool } from '../db/client';
import { RIDE_COLS } from '../db/projections';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { broadcastRideRequest } from '../services/dispatch';
import { rideMapper } from '../modules/rides/rides.service';
import type { RideStatus } from '../shared/types';
import { LOCK_RADIUS_EXPANSION, withAdvisoryLock } from './lock';

interface RideRow {
  id: string;
  riderId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropLat: number;
  dropLng: number;
  dropAddress: string;
  distanceKm: string;
  durationMinutes: number | null;
  polyline: string | null;
  suggestedFare: number;
  status: RideStatus;
  assignedDriverId: string | null;
  finalFare: number | null;
  biddingEndsAt: Date | null;
  dispatchExpandedAt: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

const EXPANDED_RADIUS_KM = 10;

export async function expandStalledRidesOnce(): Promise<number> {
  const result = await withAdvisoryLock(LOCK_RADIUS_EXPANSION, () => doExpandStalledRides());
  return result ?? 0;
}

async function doExpandStalledRides(): Promise<number> {
  logger.debug('radiusExpansion tick start');

  const now = new Date();
  const cutoff = new Date(now.getTime() - env.DISPATCH_EXPAND_AFTER_MS);

  const { rows: due } = await pool.query<RideRow>(
    `SELECT ${RIDE_COLS} FROM rides
     WHERE status = 'bidding'
       AND dispatch_expanded_at IS NULL
       AND created_at < $1
       AND bidding_ends_at > $2`,
    [cutoff, now],
  );

  if (due.length === 0) {
    logger.debug({ expanded: 0 }, 'radiusExpansion tick end');
    return 0;
  }

  let expanded = 0;
  for (const row of due) {
    const ride = rideMapper.mapRow(row);
    try {
      const notified = await broadcastRideRequest(ride, EXPANDED_RADIUS_KM);
      logger.info(
        { rideId: ride.id, notified, radiusKm: EXPANDED_RADIUS_KM },
        'radius expanded',
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message, rideId: ride.id }, 'radius expansion broadcast failed');
    }

    // Stamp regardless of broadcast outcome so we don't re-attempt every tick.
    try {
      await pool.query(
        'UPDATE rides SET dispatch_expanded_at = now() WHERE id = $1',
        [ride.id],
      );
      expanded += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: message, rideId: ride.id },
        'failed to set dispatchExpandedAt',
      );
    }
  }

  logger.debug({ expanded }, 'radiusExpansion tick end');
  return expanded;
}

export function startRadiusExpansionJob(intervalMs: number = 5000): NodeJS.Timeout {
  return setInterval(() => {
    const startedAt = Date.now();
    void expandStalledRidesOnce()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ err: message }, 'radiusExpansion tick failed');
      })
      .finally(() => {
        const took = Date.now() - startedAt;
        if (took > intervalMs) {
          logger.warn({ took, intervalMs }, 'radiusExpansion tick exceeded interval');
        }
      });
  }, intervalMs);
}

export function stopRadiusExpansionJob(handle: NodeJS.Timeout): void {
  clearInterval(handle);
}
