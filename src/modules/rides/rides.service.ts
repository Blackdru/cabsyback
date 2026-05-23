import { pool } from '../../db/client';
import { RIDE_COLS } from '../../db/projections';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../errors';
import { getIo } from '../../realtime/socket';
import { Rooms, ServerEvents } from '../../shared/events';
import { calculateSuggestedFare } from '../../services/fare';
import { getDirections } from '../../services/maps';
import { sendNotification } from '../../services/push';
import type {
  Ride,
  RideCancelledPayload,
  RideCompletedPayload,
  RideStartedPayload,
  RideStatus,
} from '../../shared/types';

interface RideRow {
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
  status: RideStatus;
  assignedDriverId: string | null;
  finalFare: number | null;
  biddingEndsAt: Date | null;
  dispatchExpandedAt: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

type CreateRideInput = {
  pickup: { lat: number; lng: number; address: string };
  drop: { lat: number; lng: number; address: string };
};

const BIDDING_WINDOW_SECONDS = 60;

function mapRideRow(row: RideRow): Ride {
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

async function loadRideRow(rideId: string): Promise<RideRow> {
  const { rows } = await pool.query<RideRow>(
    `SELECT ${RIDE_COLS} FROM rides WHERE id = $1 LIMIT 1`,
    [rideId],
  );
  const row = rows[0];
  if (!row) {
    throw new NotFoundError('Ride not found');
  }
  return row;
}

async function getDriverByUserId(
  userId: string,
): Promise<{ id: string; userId: string } | null> {
  const { rows } = await pool.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM drivers WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  return row ? { id: row.id, userId: row.user_id } : null;
}

export interface CreateRideResult {
  rideId: string;
  suggestedFare: number;
  biddingEndsAt: string;
}

export async function createRide(
  riderId: string,
  input: CreateRideInput,
): Promise<CreateRideResult> {
  // Per master prompt: call Google Directions ONCE, cache distance/duration/polyline.
  const directions = await getDirections(
    { lat: input.pickup.lat, lng: input.pickup.lng },
    { lat: input.drop.lat, lng: input.drop.lng },
  );
  const suggestedFare = calculateSuggestedFare(directions.distanceKm);
  const biddingEndsAt = new Date(Date.now() + BIDDING_WINDOW_SECONDS * 1000);

  const { rows } = await pool.query<RideRow>(
    `INSERT INTO rides (
       rider_id, pickup_lat, pickup_lng, pickup_address,
       drop_lat, drop_lng, drop_address,
       distance_km, duration_minutes, polyline,
       suggested_fare, status, bidding_ends_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'searching', $12)
     RETURNING ${RIDE_COLS}`,
    [
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
    ],
  );

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

export async function getRideForUser(
  userId: string,
  rideId: string,
): Promise<Ride> {
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

  throw new ForbiddenError('Not allowed to view this ride');
}

export interface RideHistoryPage {
  rides: Ride[];
  nextCursor: string | null;
}

const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT = 50;

export async function getRideHistoryForUser(
  userId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<RideHistoryPage> {
  const driver = await getDriverByUserId(userId);

  let cursorCreatedAt: Date | null = null;
  if (options.cursor) {
    const cursorRes = await pool.query<{ created_at: Date }>(
      `SELECT created_at FROM rides WHERE id = $1 LIMIT 1`,
      [options.cursor],
    );
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
  const params: unknown[] = [userId];
  let ownership: string;
  if (driver) {
    params.push(driver.id);
    ownership = `(rider_id = $1 OR assigned_driver_id = $2)`;
  } else {
    ownership = `rider_id = $1`;
  }

  let cursorClause = '';
  if (cursorCreatedAt) {
    params.push(cursorCreatedAt);
    cursorClause = `AND created_at < $${params.length}`;
  }

  params.push(limit + 1);
  const limitParam = `$${params.length}`;

  const { rows } = await pool.query<RideRow>(
    `SELECT ${RIDE_COLS} FROM rides
     WHERE ${ownership} ${cursorClause}
     ORDER BY created_at DESC
     LIMIT ${limitParam}`,
    params,
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && pageRows.length > 0
      ? pageRows[pageRows.length - 1]!.id
      : null;

  return {
    rides: pageRows.map(mapRideRow),
    nextCursor,
  };
}

const CANCELLABLE_STATUSES: ReadonlySet<RideStatus> = new Set<RideStatus>([
  'searching',
  'bidding',
  'assigned',
]);

export async function cancelRide(
  userId: string,
  rideId: string,
): Promise<{ ride: Ride; cancelledBy: 'rider' | 'driver' }> {
  const row = await loadRideRow(rideId);

  let cancelledBy: 'rider' | 'driver' | null = null;
  if (row.riderId === userId) {
    cancelledBy = 'rider';
  } else if (row.assignedDriverId) {
    const driver = await getDriverByUserId(userId);
    if (driver && driver.id === row.assignedDriverId) {
      cancelledBy = 'driver';
    }
  }

  if (!cancelledBy) {
    throw new ForbiddenError('Not allowed to cancel this ride');
  }

  if (!CANCELLABLE_STATUSES.has(row.status)) {
    throw new ConflictError(
      'Ride is not cancellable in its current state',
      undefined,
      'RIDE_NOT_CANCELLABLE',
    );
  }

  const updateRes = await pool.query<RideRow>(
    `UPDATE rides SET status = 'cancelled' WHERE id = $1 RETURNING ${RIDE_COLS}`,
    [rideId],
  );
  const updatedRow = updateRes.rows[0];
  if (!updatedRow) {
    throw new NotFoundError('Ride not found');
  }

  // If a driver was assigned, free them back to online so they can take new rides.
  if (updatedRow.assignedDriverId) {
    await pool.query(
      `UPDATE drivers SET status = 'online'
       WHERE id = $1 AND status = 'on_ride'`,
      [updatedRow.assignedDriverId],
    );
  }

  const ride = mapRideRow(updatedRow);
  const payload: RideCancelledPayload = { rideId: ride.id, by: cancelledBy };

  const io = getIo();
  io.to(Rooms.ride(ride.id)).emit(ServerEvents.RideCancelled, payload);

  // Also notify the assigned driver's user room directly — they may not have
  // joined the ride room yet (room joining happens when they place a bid).
  if (updatedRow.assignedDriverId) {
    const driverRes = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM drivers WHERE id = $1 LIMIT 1`,
      [updatedRow.assignedDriverId],
    );
    const driverUserId = driverRes.rows[0]?.user_id;
    if (driverUserId) {
      io.to(Rooms.user(driverUserId)).emit(ServerEvents.RideCancelled, payload);
    }
  }

  // Always notify the rider's user room as a safety net.
  io.to(Rooms.user(updatedRow.riderId)).emit(ServerEvents.RideCancelled, payload);

  return { ride, cancelledBy };
}

export async function startRide(userId: string, rideId: string): Promise<Ride> {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw new ForbiddenError('Only the assigned driver can start a ride');
  }

  const row = await loadRideRow(rideId);

  if (row.assignedDriverId !== driver.id) {
    throw new ForbiddenError('Only the assigned driver can start a ride');
  }

  if (row.status !== 'assigned') {
    throw new ConflictError(
      'Ride is not startable in its current state',
      undefined,
      'RIDE_NOT_STARTABLE',
    );
  }

  const startedAt = new Date();
  const { rows } = await pool.query<RideRow>(
    `UPDATE rides SET status = 'started', started_at = $1
     WHERE id = $2
     RETURNING ${RIDE_COLS}`,
    [startedAt, rideId],
  );
  const updatedRow = rows[0];
  if (!updatedRow) {
    throw new NotFoundError('Ride not found');
  }

  const ride = mapRideRow(updatedRow);
  const payload: RideStartedPayload = {
    rideId: ride.id,
    startedAt: startedAt.toISOString(),
  };

  const io = getIo();
  io.to(Rooms.ride(ride.id)).emit(ServerEvents.RideStarted, payload);
  io.to(Rooms.user(updatedRow.riderId)).emit(ServerEvents.RideStarted, payload);

  void sendNotification(updatedRow.riderId, {
    title: 'Trip started',
    body: 'Your driver has started the trip.',
    data: { rideId: ride.id },
  });

  return ride;
}

export async function completeRide(userId: string, rideId: string): Promise<Ride> {
  const driver = await getDriverByUserId(userId);
  if (!driver) {
    throw new ForbiddenError('Only the assigned driver can complete a ride');
  }

  const row = await loadRideRow(rideId);

  if (row.assignedDriverId !== driver.id) {
    throw new ForbiddenError('Only the assigned driver can complete a ride');
  }

  if (row.status !== 'started') {
    throw new ConflictError(
      'Ride is not completable in its current state',
      undefined,
      'RIDE_NOT_COMPLETABLE',
    );
  }

  const acceptedRes = await pool.query<{ amount: number }>(
    `SELECT amount FROM bids WHERE ride_id = $1 AND status = 'accepted' LIMIT 1`,
    [rideId],
  );
  const acceptedBid = acceptedRes.rows[0];
  if (!acceptedBid) {
    throw new ConflictError(
      'Ride has no accepted bid to settle',
      undefined,
      'RIDE_NO_ACCEPTED_BID',
    );
  }

  const completedAt = new Date();
  const { rows } = await pool.query<RideRow>(
    `UPDATE rides
     SET status = 'completed', completed_at = $1, final_fare = $2
     WHERE id = $3
     RETURNING ${RIDE_COLS}`,
    [completedAt, acceptedBid.amount, rideId],
  );
  const updatedRow = rows[0];
  if (!updatedRow) {
    throw new NotFoundError('Ride not found');
  }

  // Free the driver back to online.
  await pool.query(
    `UPDATE drivers SET status = 'online'
     WHERE id = $1 AND status = 'on_ride'`,
    [driver.id],
  );

  const ride = mapRideRow(updatedRow);
  const payload: RideCompletedPayload = {
    rideId: ride.id,
    completedAt: completedAt.toISOString(),
    finalFare: acceptedBid.amount,
  };

  const io = getIo();
  io.to(Rooms.ride(ride.id)).emit(ServerEvents.RideCompleted, payload);
  io.to(Rooms.user(updatedRow.riderId)).emit(ServerEvents.RideCompleted, payload);

  void sendNotification(updatedRow.riderId, {
    title: 'Trip complete',
    body: 'Please rate your driver.',
    data: { rideId: ride.id },
  });

  return ride;
}

// Exported for the dispatch service so it can stay consistent with REST-shaped rides.
export const rideMapper = {
  mapRow: mapRideRow,
};

// Internal helper exposed for dispatch (avoids duplicating the driver-id -> userId join).
export async function getDriverUserIds(
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

export async function loadRideById(rideId: string): Promise<Ride> {
  const row = await loadRideRow(rideId);
  return mapRideRow(row);
}

export async function setRideStatus(
  rideId: string,
  status: RideStatus,
): Promise<Ride> {
  const { rows } = await pool.query<RideRow>(
    `UPDATE rides SET status = $1 WHERE id = $2 RETURNING ${RIDE_COLS}`,
    [status, rideId],
  );
  const row = rows[0];
  if (!row) {
    throw new NotFoundError('Ride not found');
  }
  return mapRideRow(row);
}
