"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateRide = rateRide;
const client_1 = require("../../db/client");
const errors_1 = require("../../errors");
function toRatingDto(row) {
    return {
        id: row.id,
        rideId: row.ride_id,
        byUserId: row.by_user_id,
        forUserId: row.for_user_id,
        stars: row.stars,
        comment: row.comment,
        createdAt: row.created_at.toISOString(),
    };
}
function roundToOneDecimal(value) {
    return (Math.round(value * 10) / 10).toFixed(1);
}
async function rateRide(callerUserId, rideId, stars, comment) {
    const rideRes = await client_1.pool.query(`SELECT rider_id, status, assigned_driver_id FROM rides WHERE id = $1 LIMIT 1`, [rideId]);
    const ride = rideRes.rows[0];
    if (!ride) {
        throw new errors_1.NotFoundError('Ride not found');
    }
    if (ride.status !== 'completed') {
        throw new errors_1.ConflictError('Ride is not completed', undefined, 'RIDE_NOT_COMPLETED');
    }
    let forUserId;
    if (callerUserId === ride.rider_id) {
        if (!ride.assigned_driver_id) {
            throw new errors_1.ForbiddenError();
        }
        const driverRes = await client_1.pool.query(`SELECT user_id FROM drivers WHERE id = $1 LIMIT 1`, [ride.assigned_driver_id]);
        const driverRow = driverRes.rows[0];
        if (!driverRow) {
            throw new errors_1.ForbiddenError();
        }
        forUserId = driverRow.user_id;
    }
    else {
        if (!ride.assigned_driver_id) {
            throw new errors_1.ForbiddenError();
        }
        const driverRes = await client_1.pool.query(`SELECT user_id FROM drivers WHERE id = $1 LIMIT 1`, [ride.assigned_driver_id]);
        const driverRow = driverRes.rows[0];
        if (!driverRow || driverRow.user_id !== callerUserId) {
            throw new errors_1.ForbiddenError();
        }
        forUserId = ride.rider_id;
    }
    const existingRes = await client_1.pool.query(`SELECT id FROM ratings WHERE ride_id = $1 AND by_user_id = $2 LIMIT 1`, [rideId, callerUserId]);
    if (existingRes.rows[0]) {
        throw new errors_1.ConflictError('Already rated', undefined, 'ALREADY_RATED');
    }
    const client = await client_1.pool.connect();
    let inserted;
    try {
        await client.query('BEGIN');
        const insertRes = await client.query(`INSERT INTO ratings (ride_id, by_user_id, for_user_id, stars, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ride_id, by_user_id, for_user_id, stars, comment, created_at`, [rideId, callerUserId, forUserId, stars, comment ?? null]);
        const row = insertRes.rows[0];
        if (!row)
            throw new Error('failed to insert rating');
        inserted = row;
        const avgRes = await client.query(`SELECT avg(stars)::text AS avg FROM ratings WHERE for_user_id = $1`, [forUserId]);
        const avgValue = avgRes.rows[0]?.avg;
        const nextRating = avgValue == null ? '5.0' : roundToOneDecimal(Number(avgValue));
        await client.query(`UPDATE users SET rating = $1 WHERE id = $2`, [
            nextRating,
            forUserId,
        ]);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
    return toRatingDto(inserted);
}
//# sourceMappingURL=ratings.service.js.map