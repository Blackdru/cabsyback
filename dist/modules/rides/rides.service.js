"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rideMapper = void 0;
exports.createRide = createRide;
exports.getRideForUser = getRideForUser;
exports.getRideHistoryForUser = getRideHistoryForUser;
exports.cancelRide = cancelRide;
exports.startRide = startRide;
exports.completeRide = completeRide;
exports.getDriverUserIds = getDriverUserIds;
exports.loadRideById = loadRideById;
exports.setRideStatus = setRideStatus;
const client_1 = require("../../db/client");
const projections_1 = require("../../db/projections");
const errors_1 = require("../../errors");
const socket_1 = require("../../realtime/socket");
const events_1 = require("../../shared/events");
const fare_1 = require("../../services/fare");
const maps_1 = require("../../services/maps");
const push_1 = require("../../services/push");
const BIDDING_WINDOW_SECONDS = 60;
function mapRideRow(row) {
    return {
        id: row.id,
        riderId: row.riderId,
        pickupLat: row.pickupLat,
        pickupLng: row.pickupLng,
        pickupAddress: row.pickupAddress,
        dropLat: row.dropLat,
        dropLng: row.dropLng,
        dropAddress: row.dropAddress,
        distanceKm: Number(row.distanceKm),
        durationMinutes: row.durationMinutes,
        polyline: row.polyline,
        suggestedFare: row.suggestedFare,
        status: row.status,
        assignedDriverId: row.assignedDriverId,
        finalFare: row.finalFare,
        biddingEndsAt: row.biddingEndsAt
            ? row.biddingEndsAt.toISOString()
            : new Date(0).toISOString(),
        createdAt: row.createdAt.toISOString(),
        startedAt: row.startedAt ? row.startedAt.toISOString() : null,
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    };
}
async function loadRideRow(rideId) {
    const { rows } = await client_1.pool.query(`SELECT ${projections_1.RIDE_COLS} FROM rides WHERE id = $1 LIMIT 1`, [rideId]);
    const row = rows[0];
    if (!row) {
        throw new errors_1.NotFoundError('Ride not found');
    }
    return row;
}
async function getDriverByUserId(userId) {
    const { rows } = await client_1.pool.query(`SELECT id, user_id FROM drivers WHERE user_id = $1 LIMIT 1`, [userId]);
    const row = rows[0];
    return row ? { id: row.id, userId: row.user_id } : null;
}
async function createRide(riderId, input) {
    // Per master prompt: call Google Directions ONCE, cache distance/duration/polyline.
    const directions = await (0, maps_1.getDirections)({ lat: input.pickup.lat, lng: input.pickup.lng }, { lat: input.drop.lat, lng: input.drop.lng });
    const suggestedFare = (0, fare_1.calculateSuggestedFare)(directions.distanceKm);
    const biddingEndsAt = new Date(Date.now() + BIDDING_WINDOW_SECONDS * 1000);
    const { rows } = await client_1.pool.query(`INSERT INTO rides (
       rider_id, pickup_lat, pickup_lng, pickup_address,
       drop_lat, drop_lng, drop_address,
       distance_km, duration_minutes, polyline,
       suggested_fare, status, bidding_ends_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'searching', $12)
     RETURNING ${projections_1.RIDE_COLS}`, [
        riderId,
        input.pickup.lat,
        input.pickup.lng,
        input.pickup.address,
        input.drop.lat,
        input.drop.lng,
        input.drop.address,
        directions.distanceKm.toFixed(2),
        directions.durationMinutes,
        directions.polyline,
        suggestedFare,
        biddingEndsAt,
    ]);
    const row = rows[0];
    if (!row) {
        throw new Error('failed to insert ride');
    }
    return {
        rideId: row.id,
        suggestedFare: row.suggestedFare,
        biddingEndsAt: biddingEndsAt.toISOString(),
    };
}
async function getRideForUser(userId, rideId) {
    const row = await loadRideRow(rideId);
    if (row.riderId === userId) {
        return mapRideRow(row);
    }
    if (row.assignedDriverId) {
        const driver = await getDriverByUserId(userId);
        if (driver && driver.id === row.assignedDriverId) {
            return mapRideRow(row);
        }
    }
    throw new errors_1.ForbiddenError('Not allowed to view this ride');
}
const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT = 50;
async function getRideHistoryForUser(userId, options = {}) {
    const driver = await getDriverByUserId(userId);
    let cursorCreatedAt = null;
    if (options.cursor) {
        const cursorRes = await client_1.pool.query(`SELECT created_at FROM rides WHERE id = $1 LIMIT 1`, [options.cursor]);
        const cursorRow = cursorRes.rows[0];
        if (cursorRow) {
            cursorCreatedAt = cursorRow.created_at;
        }
        // If the cursor doesn't resolve, fall through and return the first page —
        // safer than 404'ing an infinite scroll mid-session.
    }
    const requestedLimit = options.limit ?? HISTORY_DEFAULT_LIMIT;
    const limit = Math.min(Math.max(1, requestedLimit), HISTORY_MAX_LIMIT);
    // Build query: ownership clause varies by whether caller is also a driver.
    // Param order: $1 = riderId, $2 = driverId (when present), $N = cursorCreatedAt (when present).
    const params = [userId];
    let ownership;
    if (driver) {
        params.push(driver.id);
        ownership = `(rider_id = $1 OR assigned_driver_id = $2)`;
    }
    else {
        ownership = `rider_id = $1`;
    }
    let cursorClause = '';
    if (cursorCreatedAt) {
        params.push(cursorCreatedAt);
        cursorClause = `AND created_at < $${params.length}`;
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;
    const { rows } = await client_1.pool.query(`SELECT ${projections_1.RIDE_COLS} FROM rides
     WHERE ${ownership} ${cursorClause}
     ORDER BY created_at DESC
     LIMIT ${limitParam}`, params);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && pageRows.length > 0
        ? pageRows[pageRows.length - 1].id
        : null;
    return {
        rides: pageRows.map(mapRideRow),
        nextCursor,
    };
}
const CANCELLABLE_STATUSES = new Set([
    'searching',
    'bidding',
    'assigned',
]);
async function cancelRide(userId, rideId) {
    const row = await loadRideRow(rideId);
    let cancelledBy = null;
    if (row.riderId === userId) {
        cancelledBy = 'rider';
    }
    else if (row.assignedDriverId) {
        const driver = await getDriverByUserId(userId);
        if (driver && driver.id === row.assignedDriverId) {
            cancelledBy = 'driver';
        }
    }
    if (!cancelledBy) {
        throw new errors_1.ForbiddenError('Not allowed to cancel this ride');
    }
    if (!CANCELLABLE_STATUSES.has(row.status)) {
        throw new errors_1.ConflictError('Ride is not cancellable in its current state', undefined, 'RIDE_NOT_CANCELLABLE');
    }
    const updateRes = await client_1.pool.query(`UPDATE rides SET status = 'cancelled' WHERE id = $1 RETURNING ${projections_1.RIDE_COLS}`, [rideId]);
    const updatedRow = updateRes.rows[0];
    if (!updatedRow) {
        throw new errors_1.NotFoundError('Ride not found');
    }
    // If a driver was assigned, free them back to online so they can take new rides.
    if (updatedRow.assignedDriverId) {
        await client_1.pool.query(`UPDATE drivers SET status = 'online'
       WHERE id = $1 AND status = 'on_ride'`, [updatedRow.assignedDriverId]);
    }
    const ride = mapRideRow(updatedRow);
    const payload = { rideId: ride.id, by: cancelledBy };
    const io = (0, socket_1.getIo)();
    io.to(events_1.Rooms.ride(ride.id)).emit(events_1.ServerEvents.RideCancelled, payload);
    // Also notify the assigned driver's user room directly — they may not have
    // joined the ride room yet (room joining happens when they place a bid).
    if (updatedRow.assignedDriverId) {
        const driverRes = await client_1.pool.query(`SELECT user_id FROM drivers WHERE id = $1 LIMIT 1`, [updatedRow.assignedDriverId]);
        const driverUserId = driverRes.rows[0]?.user_id;
        if (driverUserId) {
            io.to(events_1.Rooms.user(driverUserId)).emit(events_1.ServerEvents.RideCancelled, payload);
        }
    }
    // Always notify the rider's user room as a safety net.
    io.to(events_1.Rooms.user(updatedRow.riderId)).emit(events_1.ServerEvents.RideCancelled, payload);
    return { ride, cancelledBy };
}
async function startRide(userId, rideId) {
    const driver = await getDriverByUserId(userId);
    if (!driver) {
        throw new errors_1.ForbiddenError('Only the assigned driver can start a ride');
    }
    const row = await loadRideRow(rideId);
    if (row.assignedDriverId !== driver.id) {
        throw new errors_1.ForbiddenError('Only the assigned driver can start a ride');
    }
    if (row.status !== 'assigned') {
        throw new errors_1.ConflictError('Ride is not startable in its current state', undefined, 'RIDE_NOT_STARTABLE');
    }
    const startedAt = new Date();
    const { rows } = await client_1.pool.query(`UPDATE rides SET status = 'started', started_at = $1
     WHERE id = $2
     RETURNING ${projections_1.RIDE_COLS}`, [startedAt, rideId]);
    const updatedRow = rows[0];
    if (!updatedRow) {
        throw new errors_1.NotFoundError('Ride not found');
    }
    const ride = mapRideRow(updatedRow);
    const payload = {
        rideId: ride.id,
        startedAt: startedAt.toISOString(),
    };
    const io = (0, socket_1.getIo)();
    io.to(events_1.Rooms.ride(ride.id)).emit(events_1.ServerEvents.RideStarted, payload);
    io.to(events_1.Rooms.user(updatedRow.riderId)).emit(events_1.ServerEvents.RideStarted, payload);
    void (0, push_1.sendNotification)(updatedRow.riderId, {
        title: 'Trip started',
        body: 'Your driver has started the trip.',
        data: { rideId: ride.id },
    });
    return ride;
}
async function completeRide(userId, rideId) {
    const driver = await getDriverByUserId(userId);
    if (!driver) {
        throw new errors_1.ForbiddenError('Only the assigned driver can complete a ride');
    }
    const row = await loadRideRow(rideId);
    if (row.assignedDriverId !== driver.id) {
        throw new errors_1.ForbiddenError('Only the assigned driver can complete a ride');
    }
    if (row.status !== 'started') {
        throw new errors_1.ConflictError('Ride is not completable in its current state', undefined, 'RIDE_NOT_COMPLETABLE');
    }
    const acceptedRes = await client_1.pool.query(`SELECT amount FROM bids WHERE ride_id = $1 AND status = 'accepted' LIMIT 1`, [rideId]);
    const acceptedBid = acceptedRes.rows[0];
    if (!acceptedBid) {
        throw new errors_1.ConflictError('Ride has no accepted bid to settle', undefined, 'RIDE_NO_ACCEPTED_BID');
    }
    const completedAt = new Date();
    const { rows } = await client_1.pool.query(`UPDATE rides
     SET status = 'completed', completed_at = $1, final_fare = $2
     WHERE id = $3
     RETURNING ${projections_1.RIDE_COLS}`, [completedAt, acceptedBid.amount, rideId]);
    const updatedRow = rows[0];
    if (!updatedRow) {
        throw new errors_1.NotFoundError('Ride not found');
    }
    // Free the driver back to online.
    await client_1.pool.query(`UPDATE drivers SET status = 'online'
     WHERE id = $1 AND status = 'on_ride'`, [driver.id]);
    const ride = mapRideRow(updatedRow);
    const payload = {
        rideId: ride.id,
        completedAt: completedAt.toISOString(),
        finalFare: acceptedBid.amount,
    };
    const io = (0, socket_1.getIo)();
    io.to(events_1.Rooms.ride(ride.id)).emit(events_1.ServerEvents.RideCompleted, payload);
    io.to(events_1.Rooms.user(updatedRow.riderId)).emit(events_1.ServerEvents.RideCompleted, payload);
    void (0, push_1.sendNotification)(updatedRow.riderId, {
        title: 'Trip complete',
        body: 'Please rate your driver.',
        data: { rideId: ride.id },
    });
    return ride;
}
// Exported for the dispatch service so it can stay consistent with REST-shaped rides.
exports.rideMapper = {
    mapRow: mapRideRow,
};
// Internal helper exposed for dispatch (avoids duplicating the driver-id -> userId join).
async function getDriverUserIds(driverIds) {
    const map = new Map();
    if (driverIds.length === 0)
        return map;
    const { rows } = await client_1.pool.query(`SELECT id, user_id FROM drivers WHERE id = ANY($1::uuid[])`, [driverIds]);
    for (const r of rows) {
        map.set(r.id, r.user_id);
    }
    return map;
}
async function loadRideById(rideId) {
    const row = await loadRideRow(rideId);
    return mapRideRow(row);
}
async function setRideStatus(rideId, status) {
    const { rows } = await client_1.pool.query(`UPDATE rides SET status = $1 WHERE id = $2 RETURNING ${projections_1.RIDE_COLS}`, [status, rideId]);
    const row = rows[0];
    if (!row) {
        throw new errors_1.NotFoundError('Ride not found');
    }
    return mapRideRow(row);
}
//# sourceMappingURL=rides.service.js.map