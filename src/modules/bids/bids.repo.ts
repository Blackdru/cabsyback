import type { PoolClient } from 'pg';
import { pool } from '../../db/client';
import { BID_COLS, DRIVER_COLS, RIDE_COLS } from '../../db/projections';
import { computeEtasForDrivers } from '../../services/eta';
import type { Bid, BidWithDriver, Driver, Ride } from '../../shared/types';

// Hand-typed row shapes (snake_case → camelCase aliasing happens in the
// SELECT projections, so these match what pg returns directly).
export interface BidRow {
  id: string;
  rideId: string;
  driverId: string;
  amount: number;
  status: 'active' | 'accepted' | 'rejected' | 'expired';
  createdAt: Date;
  updatedAt: Date;
}

export interface DriverRow {
  id: string;
  userId: string;
  licenseNo: string;
  vehicleNo: string;
  vehicleModel: string;
  status: 'offline' | 'online' | 'on_ride';
  rating: string;
  kycVerified: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface RideRow {
  id: string;
  riderId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropLat: number;
  dropLng: number;
  dropAddress: string;
  distanceKm: string;
  durationMinutes: number | null;
  polyline: string | null;
  suggestedFare: number;
  status:
    | 'searching'
    | 'bidding'
    | 'assigned'
    | 'started'
    | 'completed'
    | 'cancelled'
    | 'expired';
  assignedDriverId: string | null;
  finalFare: number | null;
  biddingEndsAt: Date | null;
  dispatchExpandedAt: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface UserRow {
  id: string;
  phone: string;
  name: string | null;
  rating: string;
  fcmToken: string | null;
  createdAt: Date;
}

// Tx alias kept for callers — now a real pg PoolClient inside an explicit BEGIN/COMMIT.
export type Tx = PoolClient;

export function mapBidRow(row: BidRow): Bid {
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

export function mapDriverRow(row: DriverRow): Driver {
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

export function mapRideRow(row: RideRow): Ride {
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

export async function findDriverByUserId(userId: string): Promise<DriverRow | undefined> {
  const { rows } = await pool.query<DriverRow>(
    `SELECT ${DRIVER_COLS} FROM drivers WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0];
}

export async function findRideById(rideId: string): Promise<RideRow | undefined> {
  const { rows } = await pool.query<RideRow>(
    `SELECT ${RIDE_COLS} FROM rides WHERE id = $1 LIMIT 1`,
    [rideId],
  );
  return rows[0];
}

export async function findActiveBidForDriver(
  rideId: string,
  driverId: string,
): Promise<BidRow | undefined> {
  const { rows } = await pool.query<BidRow>(
    `SELECT ${BID_COLS} FROM bids
     WHERE ride_id = $1 AND driver_id = $2 AND status = 'active'
     LIMIT 1`,
    [rideId, driverId],
  );
  return rows[0];
}

export async function insertBid(values: {
  rideId: string;
  driverId: string;
  amount: number;
}): Promise<BidRow> {
  const { rows } = await pool.query<BidRow>(
    `INSERT INTO bids (ride_id, driver_id, amount, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING ${BID_COLS}`,
    [values.rideId, values.driverId, values.amount],
  );
  const row = rows[0];
  if (!row) throw new Error('failed to insert bid');
  return row;
}

export async function updateBidAmount(
  bidId: string,
  amount: number,
): Promise<BidRow | undefined> {
  const { rows } = await pool.query<BidRow>(
    `UPDATE bids SET amount = $1, updated_at = now()
     WHERE id = $2 AND status = 'active'
     RETURNING ${BID_COLS}`,
    [amount, bidId],
  );
  return rows[0];
}

export async function setRideStatusIfSearching(rideId: string): Promise<void> {
  await pool.query(
    `UPDATE rides SET status = 'bidding'
     WHERE id = $1 AND status = 'searching'`,
    [rideId],
  );
}

export async function getBidsForRide(rideId: string): Promise<BidWithDriver[]> {
  const rideLocRes = await pool.query<{ pickup_lat: number; pickup_lng: number }>(
    `SELECT pickup_lat, pickup_lng FROM rides WHERE id = $1 LIMIT 1`,
    [rideId],
  );
  const rideLoc = rideLocRes.rows[0];

  const { rows } = await pool.query<{
    bid_id: string;
    bid_ride_id: string;
    bid_driver_id: string;
    bid_amount: number;
    bid_status: 'active' | 'accepted' | 'rejected' | 'expired';
    bid_created_at: Date;
    bid_updated_at: Date;
    driver_name: string | null;
    driver_rating: string;
    vehicle_model: string;
  }>(
    `SELECT b.id          AS bid_id,
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
     ORDER BY b.amount ASC`,
    [rideId],
  );

  // Batched ETA lookup: one PostGIS query for all driver locations, instead
  // of N separate queries (was visibly N+1 with 10+ bids).
  const etaMap = rideLoc
    ? await computeEtasForDrivers(
        rows.map((r) => r.bid_driver_id),
        rideLoc.pickup_lat,
        rideLoc.pickup_lng,
      )
    : new Map<string, number>();

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

export async function lockRideForUpdate(
  tx: Tx,
  rideId: string,
): Promise<RideRow | undefined> {
  const { rows } = await tx.query<RideRow>(
    `SELECT ${RIDE_COLS} FROM rides WHERE id = $1 FOR UPDATE`,
    [rideId],
  );
  return rows[0];
}

export async function getBidByIdInTx(
  tx: Tx,
  bidId: string,
): Promise<BidRow | undefined> {
  const { rows } = await tx.query<BidRow>(
    `SELECT ${BID_COLS} FROM bids WHERE id = $1 LIMIT 1`,
    [bidId],
  );
  return rows[0];
}

export async function getDriverByIdInTx(
  tx: Tx,
  driverId: string,
): Promise<DriverRow | undefined> {
  const { rows } = await tx.query<DriverRow>(
    `SELECT ${DRIVER_COLS} FROM drivers WHERE id = $1 LIMIT 1`,
    [driverId],
  );
  return rows[0];
}

export async function assignRideInTx(
  tx: Tx,
  rideId: string,
  driverId: string,
  finalFare: number,
): Promise<RideRow | undefined> {
  const { rows } = await tx.query<RideRow>(
    `UPDATE rides
     SET status = 'assigned',
         assigned_driver_id = $1,
         final_fare = $2,
         bidding_ends_at = NULL
     WHERE id = $3
     RETURNING ${RIDE_COLS}`,
    [driverId, finalFare, rideId],
  );
  return rows[0];
}

export async function acceptBidInTx(
  tx: Tx,
  bidId: string,
): Promise<BidRow | undefined> {
  const { rows } = await tx.query<BidRow>(
    `UPDATE bids SET status = 'accepted', updated_at = now()
     WHERE id = $1
     RETURNING ${BID_COLS}`,
    [bidId],
  );
  return rows[0];
}

export async function rejectOtherBidsInTx(
  tx: Tx,
  rideId: string,
  winningBidId: string,
): Promise<BidRow[]> {
  const { rows } = await tx.query<BidRow>(
    `UPDATE bids SET status = 'rejected', updated_at = now()
     WHERE ride_id = $1 AND id <> $2 AND status = 'active'
     RETURNING ${BID_COLS}`,
    [rideId, winningBidId],
  );
  return rows;
}

export async function setDriverOnRideInTx(
  tx: Tx,
  driverId: string,
): Promise<void> {
  await tx.query(`UPDATE drivers SET status = 'on_ride' WHERE id = $1`, [
    driverId,
  ]);
}

// --- Withdraw-all (driver going offline) -----------------------------------

export async function expireDriverActiveBids(driverId: string): Promise<{
  bidId: string;
  rideId: string;
}[]> {
  // Single UPDATE: only expire the driver's active bids on rides currently in
  // the 'bidding' phase (subselect). RETURNING gives us the affected (id, ride_id)
  // tuples for the broadcast loop in the caller.
  const { rows } = await pool.query<{ id: string; ride_id: string }>(
    `UPDATE bids SET status = 'expired', updated_at = now()
     WHERE driver_id = $1
       AND status = 'active'
       AND ride_id IN (SELECT id FROM rides WHERE status = 'bidding')
     RETURNING id, ride_id`,
    [driverId],
  );

  return rows.map((r) => ({ bidId: r.id, rideId: r.ride_id }));
}

// --- Helper for assignment broadcast ---------------------------------------

export async function getDriverWithUser(
  driverId: string,
): Promise<{ driver: DriverRow; user: UserRow } | null> {
  const { rows } = await pool.query<{
    d_id: string;
    d_user_id: string;
    d_license_no: string;
    d_vehicle_no: string;
    d_vehicle_model: string;
    d_status: 'offline' | 'online' | 'on_ride';
    d_rating: string;
    d_kyc_verified: boolean;
    d_last_seen_at: Date | null;
    d_created_at: Date;
    u_id: string;
    u_phone: string;
    u_name: string | null;
    u_rating: string;
    u_fcm_token: string | null;
    u_created_at: Date;
  }>(
    `SELECT d.id            AS d_id,
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
     LIMIT 1`,
    [driverId],
  );
  const row = rows[0];
  if (!row) return null;
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

// Enriched join used by the post-accept broadcast: pulls vehicle + phone +
// rating in a single round-trip so RideAssigned can carry everything the
// rider tracking screen needs without follow-up REST calls.
export interface AssignedDriverInfo {
  id: string;
  userId: string;
  name: string;
  phone: string;
  rating: number;
  vehicleModel: string;
  vehicleNo: string;
}

export async function getAssignedDriverInfo(
  driverId: string,
): Promise<AssignedDriverInfo | null> {
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    vehicle_model: string;
    vehicle_no: string;
    driver_rating: string;
    name: string | null;
    phone: string;
  }>(
    `SELECT d.id            AS id,
            d.user_id       AS user_id,
            d.vehicle_model AS vehicle_model,
            d.vehicle_no    AS vehicle_no,
            d.rating        AS driver_rating,
            u.name          AS name,
            u.phone         AS phone
     FROM drivers d
     INNER JOIN users u ON d.user_id = u.id
     WHERE d.id = $1
     LIMIT 1`,
    [driverId],
  );
  const row = rows[0];
  if (!row) return null;
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

export async function getDriverUserIdsByIds(
  driverIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (driverIds.length === 0) return map;
  const { rows } = await pool.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM drivers WHERE id = ANY($1::uuid[])`,
    [driverIds],
  );
  for (const r of rows) {
    map.set(r.id, r.user_id);
  }
  return map;
}

// Postgres unique-violation error code.
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}
