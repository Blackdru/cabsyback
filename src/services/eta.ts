import { pool } from '../db/client';
import { logger } from '../config/logger';
import { getDriverLocation } from './geo';
import { haversineKm } from './fare';

const AVG_SPEED_KMH = 25;

export function computeEtaMinutes(distanceKm: number): number {
  const minutes = (distanceKm / AVG_SPEED_KMH) * 60;
  return Math.max(1, Math.ceil(minutes));
}

// Returns 0 as a sentinel for "unknown" — the driver has no recorded location.
// UI treats 0 as a hidden ETA rather than a real one.
export async function computeBidEta(
  driverId: string,
  pickupLat: number,
  pickupLng: number,
): Promise<number> {
  let loc: { lat: number; lng: number } | null;
  try {
    loc = await getDriverLocation(driverId);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), driverId },
      'computeBidEta: getDriverLocation failed',
    );
    return 0;
  }
  if (!loc) return 0;
  const distanceKm = haversineKm(loc, { lat: pickupLat, lng: pickupLng });
  return computeEtaMinutes(distanceKm);
}

// Batched version of computeBidEta. Single PostGIS query fetches every
// driver's location in one round-trip; previously each bid hit getDriverLocation
// independently (N+1 — 20 bids = 20 sequential pg queries). Returns a Map
// driverId -> etaMinutes; missing drivers default to 0 at the call site.
export async function computeEtasForDrivers(
  driverIds: string[],
  pickupLat: number,
  pickupLng: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (driverIds.length === 0) return out;

  try {
    const { rows } = await pool.query<{
      id: string;
      lat: number | string;
      lng: number | string;
    }>(
      `SELECT id,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng
       FROM drivers
       WHERE id = ANY($1::uuid[])
         AND location IS NOT NULL`,
      [driverIds],
    );
    for (const row of rows) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      const distanceKm = haversineKm({ lat, lng }, { lat: pickupLat, lng: pickupLng });
      out.set(row.id, computeEtaMinutes(distanceKm));
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'computeEtasForDrivers: batch lookup failed',
    );
  }
  return out;
}
