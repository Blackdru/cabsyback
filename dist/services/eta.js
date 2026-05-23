"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeEtaMinutes = computeEtaMinutes;
exports.computeBidEta = computeBidEta;
exports.computeEtasForDrivers = computeEtasForDrivers;
const client_1 = require("../db/client");
const logger_1 = require("../config/logger");
const geo_1 = require("./geo");
const fare_1 = require("./fare");
const AVG_SPEED_KMH = 25;
function computeEtaMinutes(distanceKm) {
    const minutes = (distanceKm / AVG_SPEED_KMH) * 60;
    return Math.max(1, Math.ceil(minutes));
}
// Returns 0 as a sentinel for "unknown" — the driver has no recorded location.
// UI treats 0 as a hidden ETA rather than a real one.
async function computeBidEta(driverId, pickupLat, pickupLng) {
    let loc;
    try {
        loc = await (0, geo_1.getDriverLocation)(driverId);
    }
    catch (err) {
        logger_1.logger.warn({ err: err instanceof Error ? err.message : String(err), driverId }, 'computeBidEta: getDriverLocation failed');
        return 0;
    }
    if (!loc)
        return 0;
    const distanceKm = (0, fare_1.haversineKm)(loc, { lat: pickupLat, lng: pickupLng });
    return computeEtaMinutes(distanceKm);
}
// Batched version of computeBidEta. Single PostGIS query fetches every
// driver's location in one round-trip; previously each bid hit getDriverLocation
// independently (N+1 — 20 bids = 20 sequential pg queries). Returns a Map
// driverId -> etaMinutes; missing drivers default to 0 at the call site.
async function computeEtasForDrivers(driverIds, pickupLat, pickupLng) {
    const out = new Map();
    if (driverIds.length === 0)
        return out;
    try {
        const { rows } = await client_1.pool.query(`SELECT id,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng
       FROM drivers
       WHERE id = ANY($1::uuid[])
         AND location IS NOT NULL`, [driverIds]);
        for (const row of rows) {
            const lat = Number(row.lat);
            const lng = Number(row.lng);
            if (Number.isNaN(lat) || Number.isNaN(lng))
                continue;
            const distanceKm = (0, fare_1.haversineKm)({ lat, lng }, { lat: pickupLat, lng: pickupLng });
            out.set(row.id, computeEtaMinutes(distanceKm));
        }
    }
    catch (err) {
        logger_1.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'computeEtasForDrivers: batch lookup failed');
    }
    return out;
}
//# sourceMappingURL=eta.js.map