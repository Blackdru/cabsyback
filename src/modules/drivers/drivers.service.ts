import { pool } from '../../db/client';
import { DRIVER_COLS } from '../../db/projections';
import {
  ConflictError,
  DriverOfflineError,
  ForbiddenError,
  NotFoundError,
} from '../../errors';
import { addDriverLocation, removeDriverLocation } from '../../services/geo';
import type { Driver, LatLng } from '../../shared/types';
import type { OnboardDriverInput } from '../../shared/schemas';

export interface EarningsDto {
  todayPaise: number;
  todayRides: number;
  todayMinutesOnline: number;
  weekPaise: number;
  weekRides: number;
}

interface DriverRow {
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

function toDriver(row: DriverRow): Driver {
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

async function findDriverRowByUserId(userId: string): Promise<DriverRow | undefined> {
  const { rows } = await pool.query<DriverRow>(
    `SELECT ${DRIVER_COLS} FROM drivers WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0];
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

export async function onboard(
  userId: string,
  input: OnboardDriverInput,
): Promise<Driver> {
  const existing = await findDriverRowByUserId(userId);
  if (existing) {
    throw new ConflictError('Already onboarded');
  }

  try {
    const { rows } = await pool.query<DriverRow>(
      `INSERT INTO drivers (user_id, license_no, vehicle_no, vehicle_model, status, kyc_verified)
       VALUES ($1, $2, $3, $4, 'offline', false)
       RETURNING ${DRIVER_COLS}`,
      [userId, input.licenseNo, input.vehicleNo, input.vehicleModel],
    );
    const row = rows[0];
    if (!row) throw new Error('failed to insert driver');
    return toDriver(row);
  } catch (err) {
    // Two concurrent onboarding requests for the same user race the INSERT;
    // recover from the unique-constraint violation by treating it as a conflict.
    if (isUniqueViolation(err)) {
      const refetched = await findDriverRowByUserId(userId);
      if (refetched) {
        throw new ConflictError('Already onboarded');
      }
    }
    throw err;
  }
}

export async function getDriverByUserId(userId: string): Promise<Driver | null> {
  const row = await findDriverRowByUserId(userId);
  return row ? toDriver(row) : null;
}

// goOnline only flips the DB status; no GEO insertion happens here because no
// coordinate is available. The driver enters the geo index on the first
// updateLocation heartbeat that follows.
export async function goOnline(userId: string): Promise<void> {
  const row = await findDriverRowByUserId(userId);
  if (!row) {
    throw new NotFoundError('Driver not found');
  }
  if (row.status === 'on_ride') {
    throw new ConflictError('Driver is on a ride');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = await client.query<{ id: string }>(
      `UPDATE drivers SET status = 'online'
       WHERE id = $1 AND status <> 'on_ride'
       RETURNING id`,
      [row.id],
    );

    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new ConflictError('Driver is on a ride');
    }

    // Defensively close any leaked open session before opening a new one.
    await client.query(
      `UPDATE driver_online_sessions SET ended_at = NOW()
       WHERE driver_id = $1 AND ended_at IS NULL`,
      [row.id],
    );

    await client.query(
      `INSERT INTO driver_online_sessions (driver_id) VALUES ($1)`,
      [row.id],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function goOffline(userId: string): Promise<void> {
  const row = await findDriverRowByUserId(userId);
  if (!row) {
    throw new NotFoundError('Driver not found');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE drivers SET status = 'offline' WHERE id = $1`, [row.id]);
    await client.query(
      `UPDATE driver_online_sessions SET ended_at = NOW()
       WHERE driver_id = $1 AND ended_at IS NULL`,
      [row.id],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await removeDriverLocation(row.id);
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function sevenDaysAgoUtc(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

export async function getEarnings(userId: string): Promise<EarningsDto> {
  const driverRow = await findDriverRowByUserId(userId);
  if (!driverRow) {
    throw new ForbiddenError('Only drivers can view earnings');
  }

  const todayStart = startOfTodayUtc();
  const weekStart = sevenDaysAgoUtc();

  const aggregateRes = await pool.query<{
    today_paise: string | null;
    today_rides: string;
    week_paise: string | null;
    week_rides: string;
  }>(
    `SELECT
       coalesce(sum(final_fare) filter (where completed_at >= $1), 0)::text AS today_paise,
       count(*) filter (where completed_at >= $1)::text AS today_rides,
       coalesce(sum(final_fare) filter (where completed_at >= $2), 0)::text AS week_paise,
       count(*) filter (where completed_at >= $2)::text AS week_rides
     FROM rides
     WHERE assigned_driver_id = $3
       AND status = 'completed'
       AND completed_at >= $2`,
    [todayStart, weekStart, driverRow.id],
  );

  const row = aggregateRes.rows[0];
  const todayPaise = row ? Number(row.today_paise) : 0;
  const todayRides = row ? Number(row.today_rides) : 0;
  const weekPaise = row ? Number(row.week_paise) : 0;
  const weekRides = row ? Number(row.week_rides) : 0;

  // GREATEST clamps a session that began before today to today's start;
  // LEAST clamps an open session's effective end to NOW(). Together they
  // measure only the slice of each session that falls inside today.
  const minutesRes = await pool.query<{ minutes_online: number | string }>(
    `SELECT COALESCE(
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
       AND COALESCE(ended_at, NOW()) > $1`,
    [todayStart, driverRow.id],
  );
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

export async function updateLocation(userId: string, coords: LatLng): Promise<void> {
  const row = await findDriverRowByUserId(userId);
  if (!row) {
    throw new NotFoundError('Driver not found');
  }
  if (row.status === 'offline') {
    throw new DriverOfflineError();
  }

  await addDriverLocation(row.id, coords.lat, coords.lng);
}
