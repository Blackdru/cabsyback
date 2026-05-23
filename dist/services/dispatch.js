"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastRideRequest = broadcastRideRequest;
exports.dispatchRide = dispatchRide;
const logger_1 = require("../config/logger");
const client_1 = require("../db/client");
const geo_1 = require("./geo");
const socket_1 = require("../realtime/socket");
const events_1 = require("../shared/events");
const rides_service_1 = require("../modules/rides/rides.service");
const INITIAL_RADIUS_KM = 5;
const DRIVER_LIMIT = 20;
async function broadcastRideRequest(ride, radiusKm) {
    const nearest = await (0, geo_1.findNearestDrivers)(ride.pickupLat, ride.pickupLng, radiusKm, DRIVER_LIMIT);
    if (nearest.length === 0)
        return 0;
    const driverIds = nearest.map((d) => d.driverId);
    const driverIdToUserId = await (0, rides_service_1.getDriverUserIds)(driverIds);
    // Surface the rider's name + rating in the dispatch payload so the
    // driver's IncomingRide screen can show real identity instead of a
    // "Rider / 5.0" placeholder.
    const riderRes = await client_1.pool.query(`SELECT name, rating FROM users WHERE id = $1 LIMIT 1`, [ride.riderId]);
    const rider = riderRes.rows[0];
    const payload = {
        ride,
        suggestedFare: ride.suggestedFare,
        biddingEndsAt: ride.biddingEndsAt,
        riderName: rider?.name ?? null,
        riderRating: rider ? Number(rider.rating) : 5.0,
    };
    const io = (0, socket_1.getIo)();
    let notified = 0;
    for (const driverId of driverIds) {
        const userId = driverIdToUserId.get(driverId);
        if (!userId)
            continue;
        // Note: the realtime handler is responsible for joining the driver's
        // socket to Rooms.ride(rideId) when they place their first bid — joining
        // requires a live socket reference which we don't have here.
        io.to(events_1.Rooms.user(userId)).emit(events_1.ServerEvents.RideNewRequest, payload);
        notified += 1;
    }
    return notified;
}
async function markExpansionDone(rideId) {
    await client_1.pool.query('UPDATE rides SET dispatch_expanded_at = now() WHERE id = $1', [rideId]);
}
async function dispatchRide(rideId) {
    let ride;
    try {
        ride = await (0, rides_service_1.loadRideById)(rideId);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message, rideId }, 'dispatch: ride not found');
        return;
    }
    if (ride.status !== 'searching') {
        // Already moved on (e.g. cancelled before dispatch ran).
        return;
    }
    const notified = await broadcastRideRequest(ride, INITIAL_RADIUS_KM);
    if (notified > 0) {
        try {
            await (0, rides_service_1.setRideStatus)(ride.id, 'bidding');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message, rideId: ride.id }, 'failed to set status=bidding');
        }
        // Sentinel: drivers were found at 5km, so the radius-expansion poller
        // should not pick this ride up later.
        try {
            await markExpansionDone(ride.id);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message, rideId: ride.id }, 'failed to set dispatchExpandedAt');
        }
        return;
    }
    // No drivers in the initial 5km radius. Leave dispatchExpandedAt null so
    // the radiusExpansion poller will pick this ride up after EXPAND_AFTER_MS
    // and re-broadcast at 10km. This is restart-safe.
}
//# sourceMappingURL=dispatch.js.map