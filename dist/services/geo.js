"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDriverLocation = addDriverLocation;
exports.removeDriverLocation = removeDriverLocation;
exports.getDriverLocation = getDriverLocation;
exports.findNearestDrivers = findNearestDrivers;
exports.pruneStaleDrivers = pruneStaleDrivers;
const client_1 = require("../db/client");
const logger_1 = require("../config/logger");
// PostGIS coordinate ordering is (longitude, latitude). ST_MakePoint(lng, lat),
// ST_X => lng, ST_Y => lat. Lat/lng confusion is the #1 bug here.
// 60 seconds. The driver app heartbeats every 4s under good conditions; a
// single tunnel / network switch shouldn't kick them offline. Tune up if
// you see drivers dropping during quick connectivity blips.
const STALE_INTERVAL_SQL = `INTERVAL '60 seconds'`;
async function addDriverLocation(driverId, lat, lng) {
    await client_1.pool.query(`UPDATE drivers
     SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         last_seen_at = NOW()
     WHERE id = $3`, [lng, lat, driverId]);
}
async function removeDriverLocation(driverId) {
    await client_1.pool.query(`UPDATE drivers
     SET location = NULL,
         last_seen_at = NULL
     WHERE id = $1`, [driverId]);
}
async function getDriverLocation(driverId) {
    const result = await client_1.pool.query(`SELECT ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
     FROM drivers
     WHERE id = $1
       AND location IS NOT NULL`, [driverId]);
    const row = result.rows[0];
    if (!row)
        return null;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng))
        return null;
    return { lat, lng };
}
async function findNearestDrivers(lat, lng, radiusKm, limit = 20) {
    const radiusMeters = radiusKm * 1000;
    const result = await client_1.pool.query(`SELECT id AS driver_id,
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
     LIMIT $4`, [lng, lat, radiusMeters, limit]);
    const out = [];
    for (const row of result.rows) {
        const driverId = row.driver_id;
        const entryLat = Number(row.lat);
        const entryLng = Number(row.lng);
        const distanceKm = Number(row.distance_km);
        if (!driverId ||
            Number.isNaN(entryLat) ||
            Number.isNaN(entryLng) ||
            Number.isNaN(distanceKm)) {
            continue;
        }
        out.push({ driverId, lat: entryLat, lng: entryLng, distanceKm });
    }
    return out;
}
async function pruneStaleDrivers() {
    const client = await client_1.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`UPDATE drivers
       SET location = NULL,
           last_seen_at = NULL,
           status = 'offline'
       WHERE status = 'online'
         AND last_seen_at < NOW() - ${STALE_INTERVAL_SQL}
       RETURNING id`);
        const count = result.rowCount ?? result.rows.length;
        if (count === 0) {
            await client.query('COMMIT');
            return 0;
        }
        const driverIds = result.rows.map((r) => r.id);
        await client.query(`UPDATE driver_online_sessions
       SET ended_at = NOW()
       WHERE driver_id = ANY($1::uuid[])
         AND ended_at IS NULL`, [driverIds]);
        await client.query('COMMIT');
        if (count > 0) {
            logger_1.logger.debug({ removed: count }, 'pruned stale drivers');
        }
        return count;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=geo.js.map