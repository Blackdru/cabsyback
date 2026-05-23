"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandStalledRidesOnce = expandStalledRidesOnce;
exports.startRadiusExpansionJob = startRadiusExpansionJob;
exports.stopRadiusExpansionJob = stopRadiusExpansionJob;
const client_1 = require("../db/client");
const projections_1 = require("../db/projections");
const logger_1 = require("../config/logger");
const env_1 = require("../config/env");
const dispatch_1 = require("../services/dispatch");
const rides_service_1 = require("../modules/rides/rides.service");
const lock_1 = require("./lock");
const EXPANDED_RADIUS_KM = 10;
async function expandStalledRidesOnce() {
    const result = await (0, lock_1.withAdvisoryLock)(lock_1.LOCK_RADIUS_EXPANSION, () => doExpandStalledRides());
    return result ?? 0;
}
async function doExpandStalledRides() {
    logger_1.logger.debug('radiusExpansion tick start');
    const now = new Date();
    const cutoff = new Date(now.getTime() - env_1.env.DISPATCH_EXPAND_AFTER_MS);
    const { rows: due } = await client_1.pool.query(`SELECT ${projections_1.RIDE_COLS} FROM rides
     WHERE status = 'bidding'
       AND dispatch_expanded_at IS NULL
       AND created_at < $1
       AND bidding_ends_at > $2`, [cutoff, now]);
    if (due.length === 0) {
        logger_1.logger.debug({ expanded: 0 }, 'radiusExpansion tick end');
        return 0;
    }
    let expanded = 0;
    for (const row of due) {
        const ride = rides_service_1.rideMapper.mapRow(row);
        try {
            const notified = await (0, dispatch_1.broadcastRideRequest)(ride, EXPANDED_RADIUS_KM);
            logger_1.logger.info({ rideId: ride.id, notified, radiusKm: EXPANDED_RADIUS_KM }, 'radius expanded');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message, rideId: ride.id }, 'radius expansion broadcast failed');
        }
        // Stamp regardless of broadcast outcome so we don't re-attempt every tick.
        try {
            await client_1.pool.query('UPDATE rides SET dispatch_expanded_at = now() WHERE id = $1', [ride.id]);
            expanded += 1;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message, rideId: ride.id }, 'failed to set dispatchExpandedAt');
        }
    }
    logger_1.logger.debug({ expanded }, 'radiusExpansion tick end');
    return expanded;
}
function startRadiusExpansionJob(intervalMs = 5000) {
    return setInterval(() => {
        const startedAt = Date.now();
        void expandStalledRidesOnce()
            .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message }, 'radiusExpansion tick failed');
        })
            .finally(() => {
            const took = Date.now() - startedAt;
            if (took > intervalMs) {
                logger_1.logger.warn({ took, intervalMs }, 'radiusExpansion tick exceeded interval');
            }
        });
    }, intervalMs);
}
function stopRadiusExpansionJob(handle) {
    clearInterval(handle);
}
//# sourceMappingURL=radiusExpansion.js.map