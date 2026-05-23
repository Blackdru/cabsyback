"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboard = onboard;
exports.getDriverByUserId = getDriverByUserId;
exports.goOnline = goOnline;
exports.goOffline = goOffline;
exports.getEarnings = getEarnings;
exports.updateLocation = updateLocation;
const client_1 = require("../../db/client");
const projections_1 = require("../../db/projections");
const errors_1 = require("../../errors");
const geo_1 = require("../../services/geo");
function toDriver(row) {
    return {
        id: row.id,
        userId: row.userId,
        licenseNo: row.licenseNo,
        vehicleNo: row.vehicleNo,
        vehicleModel: row.vehicleModel,
        status: row.status,
        rating: Number(row.rating),
        kycVerified: row.kycVerified,
    };
}
async function findDriverRowByUserId(userId) {
    const { rows } = await client_1.pool.query(`SELECT ${projections_1.DRIVER_COLS} FROM drivers WHERE user_id = $1 LIMIT 1`, [userId]);
    return rows[0];
}
function isUniqueViolation(err) {
    return (typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === '23505');
}
async function onboard(userId, input) {
    const existing = await findDriverRowByUserId(userId);
    if (existing) {
        throw new errors_1.ConflictError('Already onboarded');
    }
    try {
        const { rows } = await client_1.pool.query(`INSERT INTO drivers (user_id, license_no, vehicle_no, vehicle_model, status, kyc_verified)
       VALUES ($1, $2, $3, $4, 'offline', false)
       RETURNING ${projections_1.DRIVER_COLS}`, [userId, input.licenseNo, input.vehicleNo, input.vehicleModel]);
        const row = rows[0];
        if (!row)
            throw new Error('failed to insert driver');
        return toDriver(row);
    }
    catch (err) {
        // Two concurrent onboarding requests for the same user race the INSERT;
        // recover from the unique-constraint violation by treating it as a conflict.
        if (isUniqueViolation(err)) {
            const refetched = await findDriverRowByUserId(userId);
            if (refetched) {
                throw new errors_1.ConflictError('Already onboarded');
            }
        }
        throw err;
    }
}
async function getDriverByUserId(userId) {
    const row = await findDriverRowByUserId(userId);
    return row ? toDriver(row) : null;
}
// goOnline only flips the DB status; no GEO insertion happens here because no
// coordinate is available. The driver enters the geo index on the first
// updateLocation heartbeat that follows.
async function goOnline(userId) {
    const row = await findDriverRowByUserId(userId);
    if (!row) {
        throw new errors_1.NotFoundError('Driver not found');
    }
    if (row.status === 'on_ride') {
        throw new errors_1.ConflictError('Driver is on a ride');
    }
    const client = await client_1.pool.connect();
    try {
        await client.query('BEGIN');
        const updated = await client.query(`UPDATE drivers SET status = 'online'
       WHERE id = $1 AND status <> 'on_ride'
       RETURNING id`, [row.id]);
        if (updated.rows.length === 0) {
            await client.query('ROLLBACK');
            throw new errors_1.ConflictError('Driver is on a ride');
        }
        // Defensively close any leaked open session before opening a new one.
        await client.query(`UPDATE driver_online_sessions SET ended_at = NOW()
       WHERE driver_id = $1 AND ended_at IS NULL`, [row.id]);
        await client.query(`INSERT INTO driver_online_sessions (driver_id) VALUES ($1)`, [row.id]);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
}
async function goOffline(userId) {
    const row = await findDriverRowByUserId(userId);
    if (!row) {
        throw new errors_1.NotFoundError('Driver not found');
    }
    const client = await client_1.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE drivers SET status = 'offline' WHERE id = $1`, [row.id]);
        await client.query(`UPDATE driver_online_sessions SET ended_at = NOW()
       WHERE driver_id = $1 AND ended_at IS NULL`, [row.id]);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
    await (0, geo_1.removeDriverLocation)(row.id);
}
function startOfTodayUtc() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function sevenDaysAgoUtc() {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}
async function getEarnings(userId) {
    const driverRow = await findDriverRowByUserId(userId);
    if (!driverRow) {
        throw new errors_1.ForbiddenError('Only drivers can view earnings');
    }
    const todayStart = startOfTodayUtc();
    const weekStart = sevenDaysAgoUtc();
    const aggregateRes = await client_1.pool.query(`SELECT
       coalesce(sum(final_fare) filter (where completed_at >= $1), 0)::text AS today_paise,
       count(*) filter (where completed_at >= $1)::text AS today_rides,
       coalesce(sum(final_fare) filter (where completed_at >= $2), 0)::text AS week_paise,
       count(*) filter (where completed_at >= $2)::text AS week_rides
     FROM rides
     WHERE assigned_driver_id = $3
       AND status = 'completed'
       AND completed_at >= $2`, [todayStart, weekStart, driverRow.id]);
    const row = aggregateRes.rows[0];
    const todayPaise = row ? Number(row.today_paise) : 0;
    const todayRides = row ? Number(row.today_rides) : 0;
    const weekPaise = row ? Number(row.week_paise) : 0;
    const weekRides = row ? Number(row.week_rides) : 0;
    // GREATEST clamps a session that began before today to today's start;
    // LEAST clamps an open session's effective end to NOW(). Together they
    // measure only the slice of each session that falls inside today.
    const minutesRes = await client_1.pool.query(`SELECT COALESCE(
       SUM(
         EXTRACT(EPOCH FROM (
           LEAST(COALESCE(ended_at, NOW()), NOW())
           - GREATEST(started_at, $1)
         )) / 60
       ), 0
     )::int AS minutes_online
     FROM driver_online_sessions
     WHERE driver_id = $2
       AND started_at < NOW()
       AND COALESCE(ended_at, NOW()) > $1`, [todayStart, driverRow.id]);
    const minutesRow = minutesRes.rows[0];
    const todayMinutesOnline = minutesRow ? Number(minutesRow.minutes_online) : 0;
    return {
        todayPaise,
        todayRides,
        todayMinutesOnline,
        weekPaise,
        weekRides,
    };
}
async function updateLocation(userId, coords) {
    const row = await findDriverRowByUserId(userId);
    if (!row) {
        throw new errors_1.NotFoundError('Driver not found');
    }
    if (row.status === 'offline') {
        throw new errors_1.DriverOfflineError();
    }
    await (0, geo_1.addDriverLocation)(row.id, coords.lat, coords.lng);
}
//# sourceMappingURL=drivers.service.js.map