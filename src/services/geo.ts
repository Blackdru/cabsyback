import { pool } from '../db/client';
import { logger } from '../config/logger';

// PostGIS coordinate ordering is (longitude, latitude). ST_MakePoint(lng, lat),
// ST_X => lng, ST_Y => lat. Lat/lng confusion is the #1 bug here.

// 60 seconds. The driver app heartbeats every 4s under good conditions; a
// single tunnel / network switch shouldn't kick them offline. Tune up if
// you see drivers dropping during quick connectivity blips.
const STALE_INTERVAL_SQL = `INTERVAL '60 seconds'`;

export async function addDriverLocation(
  driverId: string,
  lat: number,
  lng: number,
): Promise<void> {
  await pool.query(
    `UPDATE drivers
     SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         last_seen_at = NOW()
     WHERE id = $3`,
    [lng, lat, driverId],
  );
}

export async function removeDriverLocation(driverId: string): Promise<void> {
  await pool.query(
    `UPDATE drivers
     SET location = NULL,
         last_seen_at = NULL
     WHERE id = $1`,
    [driverId],
  );
}

export async function getDriverLocation(
  driverId: string,
): Promise<{ lat: number; lng: number } | null> {
  const result = await pool.query<{ lat: number | string; lng: number | string }>(
    `SELECT ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
     FROM drivers
     WHERE id = $1
       AND location IS NOT NULL`,
    [driverId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

interface GeoSearchEntry {
  driverId: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

interface NearestRow {
  driver_id: string;
  lat: number | string;
  lng: number | string;
  distance_km: number | string;
}

export async function findNearestDrivers(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number = 20,
): Promise<GeoSearchEntry[]> {
  const radiusMeters = radiusKm * 1000;
  const result = await pool.query<NearestRow>(
    `SELECT id AS driver_id,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng,
            ST_Distance(
              location,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) / 1000 AS distance_km
     FROM drivers
     WHERE status = 'online'
       AND location IS NOT NULL
       AND last_seen_at > NOW() - ${STALE_INTERVAL_SQL}
       AND ST_DWithin(
         location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
     ORDER BY distance_km ASC
     LIMIT $4`,
    [lng, lat, radiusMeters, limit],
  );

  const out: GeoSearchEntry[] = [];
  for (const row of result.rows) {
    const driverId = row.driver_id;
    const entryLat = Number(row.lat);
    const entryLng = Number(row.lng);
    const distanceKm = Number(row.distance_km);
    if (
      !driverId ||
      Number.isNaN(entryLat) ||
      Number.isNaN(entryLng) ||
      Number.isNaN(distanceKm)
    ) {
      continue;
    }
    out.push({ driverId, lat: entryLat, lng: entryLng, distanceKm });
  }
  return out;
}

export async function pruneStaleDrivers(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(
      `UPDATE drivers
       SET location = NULL,
           last_seen_at = NULL,
           status = 'offline'
       WHERE status = 'online'
         AND last_seen_at < NOW() - ${STALE_INTERVAL_SQL}
       RETURNING id`,
    );
    const count = result.rowCount ?? result.rows.length;
    if (count === 0) {
      await client.query('COMMIT');
      return 0;
    }

    const driverIds = result.rows.map((r) => r.id);
    await client.query(
      `UPDATE driver_online_sessions
       SET ended_at = NOW()
       WHERE driver_id = ANY($1::uuid[])
         AND ended_at IS NULL`,
      [driverIds],
    );
    await client.query('COMMIT');

    if (count > 0) {
      logger.debug({ removed: count }, 'pruned stale drivers');
    }
    return count;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
