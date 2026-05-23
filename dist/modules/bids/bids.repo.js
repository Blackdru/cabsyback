"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapBidRow = mapBidRow;
exports.mapDriverRow = mapDriverRow;
exports.mapRideRow = mapRideRow;
exports.findDriverByUserId = findDriverByUserId;
exports.findRideById = findRideById;
exports.findActiveBidForDriver = findActiveBidForDriver;
exports.insertBid = insertBid;
exports.updateBidAmount = updateBidAmount;
exports.setRideStatusIfSearching = setRideStatusIfSearching;
exports.getBidsForRide = getBidsForRide;
exports.lockRideForUpdate = lockRideForUpdate;
exports.getBidByIdInTx = getBidByIdInTx;
exports.getDriverByIdInTx = getDriverByIdInTx;
exports.assignRideInTx = assignRideInTx;
exports.acceptBidInTx = acceptBidInTx;
exports.rejectOtherBidsInTx = rejectOtherBidsInTx;
exports.setDriverOnRideInTx = setDriverOnRideInTx;
exports.expireDriverActiveBids = expireDriverActiveBids;
exports.getDriverWithUser = getDriverWithUser;
exports.getAssignedDriverInfo = getAssignedDriverInfo;
exports.getDriverUserIdsByIds = getDriverUserIdsByIds;
exports.isUniqueViolation = isUniqueViolation;
const client_1 = require("../../db/client");
const projections_1 = require("../../db/projections");
const eta_1 = require("../../services/eta");
function mapBidRow(row) {
    return {
        id: row.id,
        rideId: row.rideId,
        driverId: row.driverId,
        amount: row.amount,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}
function mapDriverRow(row) {
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
async function findDriverByUserId(userId) {
    const { rows } = await client_1.pool.query(`SELECT ${projections_1.DRIVER_COLS} FROM drivers WHERE user_id = $1 LIMIT 1`, [userId]);
    return rows[0];
}
async function findRideById(rideId) {
    const { rows } = await client_1.pool.query(`SELECT ${projections_1.RIDE_COLS} FROM rides WHERE id = $1 LIMIT 1`, [rideId]);
    return rows[0];
}
async function findActiveBidForDriver(rideId, driverId) {
    const { rows } = await client_1.pool.query(`SELECT ${projections_1.BID_COLS} FROM bids
     WHERE ride_id = $1 AND driver_id = $2 AND status = 'active'
     LIMIT 1`, [rideId, driverId]);
    return rows[0];
}
async function insertBid(values) {
    const { rows } = await client_1.pool.query(`INSERT INTO bids (ride_id, driver_id, amount, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING ${projections_1.BID_COLS}`, [values.rideId, values.driverId, values.amount]);
    const row = rows[0];
    if (!row)
        throw new Error('failed to insert bid');
    return row;
}
async function updateBidAmount(bidId, amount) {
    const { rows } = await client_1.pool.query(`UPDATE bids SET amount = $1, updated_at = now()
     WHERE id = $2 AND status = 'active'
     RETURNING ${projections_1.BID_COLS}`, [amount, bidId]);
    return rows[0];
}
async function setRideStatusIfSearching(rideId) {
    await client_1.pool.query(`UPDATE rides SET status = 'bidding'
     WHERE id = $1 AND status = 'searching'`, [rideId]);
}
async function getBidsForRide(rideId) {
    const rideLocRes = await client_1.pool.query(`SELECT pickup_lat, pickup_lng FROM rides WHERE id = $1 LIMIT 1`, [rideId]);
    const rideLoc = rideLocRes.rows[0];
    const { rows } = await client_1.pool.query(`SELECT b.id          AS bid_id,
            b.ride_id     AS bid_ride_id,
            b.driver_id   AS bid_driver_id,
            b.amount      AS bid_amount,
            b.status      AS bid_status,
            b.created_at  AS bid_created_at,
            b.updated_at  AS bid_updated_at,
            u.name        AS driver_name,
            d.rating      AS driver_rating,
            d.vehicle_model AS vehicle_model
     FROM bids b
     INNER JOIN drivers d ON b.driver_id = d.id
     INNER JOIN users   u ON d.user_id   = u.id
     WHERE b.ride_id = $1 AND b.status = 'active'
     ORDER BY b.amount ASC`, [rideId]);
    // Batched ETA lookup: one PostGIS query for all driver locations, instead
    // of N separate queries (was visibly N+1 with 10+ bids).
    const etaMap = rideLoc
        ? await (0, eta_1.computeEtasForDrivers)(rows.map((r) => r.bid_driver_id), rideLoc.pickup_lat, rideLoc.pickup_lng)
        : new Map();
    return rows.map((r) => {
        const bid = mapBidRow({
            id: r.bid_id,
            rideId: r.bid_ride_id,
            driverId: r.bid_driver_id,
            amount: r.bid_amount,
            status: r.bid_status,
            createdAt: r.bid_created_at,
            updatedAt: r.bid_updated_at,
        });
        return {
            ...bid,
            driverName: r.driver_name ?? '',
            driverRating: Number(r.driver_rating),
            vehicleModel: r.vehicle_model,
            etaMinutes: etaMap.get(r.bid_driver_id) ?? 0,
        };
    });
}
// --- Transactional helpers (acceptBid) -------------------------------------
//
// Per master prompt section 3 — explicit BEGIN / SELECT FOR UPDATE / UPDATE x N / COMMIT.
async function lockRideForUpdate(tx, rideId) {
    const { rows } = await tx.query(`SELECT ${projections_1.RIDE_COLS} FROM rides WHERE id = $1 FOR UPDATE`, [rideId]);
    return rows[0];
}
async function getBidByIdInTx(tx, bidId) {
    const { rows } = await tx.query(`SELECT ${projections_1.BID_COLS} FROM bids WHERE id = $1 LIMIT 1`, [bidId]);
    return rows[0];
}
async function getDriverByIdInTx(tx, driverId) {
    const { rows } = await tx.query(`SELECT ${projections_1.DRIVER_COLS} FROM drivers WHERE id = $1 LIMIT 1`, [driverId]);
    return rows[0];
}
async function assignRideInTx(tx, rideId, driverId, finalFare) {
    const { rows } = await tx.query(`UPDATE rides
     SET status = 'assigned',
         assigned_driver_id = $1,
         final_fare = $2,
         bidding_ends_at = NULL
     WHERE id = $3
     RETURNING ${projections_1.RIDE_COLS}`, [driverId, finalFare, rideId]);
    return rows[0];
}
async function acceptBidInTx(tx, bidId) {
    const { rows } = await tx.query(`UPDATE bids SET status = 'accepted', updated_at = now()
     WHERE id = $1
     RETURNING ${projections_1.BID_COLS}`, [bidId]);
    return rows[0];
}
async function rejectOtherBidsInTx(tx, rideId, winningBidId) {
    const { rows } = await tx.query(`UPDATE bids SET status = 'rejected', updated_at = now()
     WHERE ride_id = $1 AND id <> $2 AND status = 'active'
     RETURNING ${projections_1.BID_COLS}`, [rideId, winningBidId]);
    return rows;
}
async function setDriverOnRideInTx(tx, driverId) {
    await tx.query(`UPDATE drivers SET status = 'on_ride' WHERE id = $1`, [
        driverId,
    ]);
}
// --- Withdraw-all (driver going offline) -----------------------------------
async function expireDriverActiveBids(driverId) {
    // Single UPDATE: only expire the driver's active bids on rides currently in
    // the 'bidding' phase (subselect). RETURNING gives us the affected (id, ride_id)
    // tuples for the broadcast loop in the caller.
    const { rows } = await client_1.pool.query(`UPDATE bids SET status = 'expired', updated_at = now()
     WHERE driver_id = $1
       AND status = 'active'
       AND ride_id IN (SELECT id FROM rides WHERE status = 'bidding')
     RETURNING id, ride_id`, [driverId]);
    return rows.map((r) => ({ bidId: r.id, rideId: r.ride_id }));
}
// --- Helper for assignment broadcast ---------------------------------------
async function getDriverWithUser(driverId) {
    const { rows } = await client_1.pool.query(`SELECT d.id            AS d_id,
            d.user_id       AS d_user_id,
            d.license_no    AS d_license_no,
            d.vehicle_no    AS d_vehicle_no,
            d.vehicle_model AS d_vehicle_model,
            d.status        AS d_status,
            d.rating        AS d_rating,
            d.kyc_verified  AS d_kyc_verified,
            d.last_seen_at  AS d_last_seen_at,
            d.created_at    AS d_created_at,
            u.id            AS u_id,
            u.phone         AS u_phone,
            u.name          AS u_name,
            u.rating        AS u_rating,
            u.fcm_token     AS u_fcm_token,
            u.created_at    AS u_created_at
     FROM drivers d
     INNER JOIN users u ON d.user_id = u.id
     WHERE d.id = $1
     LIMIT 1`, [driverId]);
    const row = rows[0];
    if (!row)
        return null;
    return {
        driver: {
            id: row.d_id,
            userId: row.d_user_id,
            licenseNo: row.d_license_no,
            vehicleNo: row.d_vehicle_no,
            vehicleModel: row.d_vehicle_model,
            status: row.d_status,
            rating: row.d_rating,
            kycVerified: row.d_kyc_verified,
            lastSeenAt: row.d_last_seen_at,
            createdAt: row.d_created_at,
        },
        user: {
            id: row.u_id,
            phone: row.u_phone,
            name: row.u_name,
            rating: row.u_rating,
            fcmToken: row.u_fcm_token,
            createdAt: row.u_created_at,
        },
    };
}
async function getAssignedDriverInfo(driverId) {
    const { rows } = await client_1.pool.query(`SELECT d.id            AS id,
            d.user_id       AS user_id,
            d.vehicle_model AS vehicle_model,
            d.vehicle_no    AS vehicle_no,
            d.rating        AS driver_rating,
            u.name          AS name,
            u.phone         AS phone
     FROM drivers d
     INNER JOIN users u ON d.user_id = u.id
     WHERE d.id = $1
     LIMIT 1`, [driverId]);
    const row = rows[0];
    if (!row)
        return null;
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name ?? '',
        phone: row.phone,
        rating: Number(row.driver_rating),
        vehicleModel: row.vehicle_model,
        vehicleNo: row.vehicle_no,
    };
}
async function getDriverUserIdsByIds(driverIds) {
    const map = new Map();
    if (driverIds.length === 0)
        return map;
    const { rows } = await client_1.pool.query(`SELECT id, user_id FROM drivers WHERE id = ANY($1::uuid[])`, [driverIds]);
    for (const r of rows) {
        map.set(r.id, r.user_id);
    }
    return map;
}
// Postgres unique-violation error code.
function isUniqueViolation(err) {
    return (typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === '23505');
}
//# sourceMappingURL=bids.repo.js.map