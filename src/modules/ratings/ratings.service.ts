import { pool } from '../../db/client';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../errors';
import type { Rating } from '../../shared/types';

export interface RatingDto extends Rating {
  createdAt: string;
}

interface RatingPgRow {
  id: string;
  ride_id: string;
  by_user_id: string;
  for_user_id: string;
  stars: number;
  comment: string | null;
  created_at: Date;
}

function toRatingDto(row: RatingPgRow): RatingDto {
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

function roundToOneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

export async function rateRide(
  callerUserId: string,
  rideId: string,
  stars: number,
  comment?: string,
): Promise<RatingDto> {
  const rideRes = await pool.query<{
    rider_id: string;
    status: string;
    assigned_driver_id: string | null;
  }>(
    `SELECT rider_id, status, assigned_driver_id FROM rides WHERE id = $1 LIMIT 1`,
    [rideId],
  );
  const ride = rideRes.rows[0];
  if (!ride) {
    throw new NotFoundError('Ride not found');
  }

  if (ride.status !== 'completed') {
    throw new ConflictError('Ride is not completed', undefined, 'RIDE_NOT_COMPLETED');
  }

  let forUserId: string;
  if (callerUserId === ride.rider_id) {
    if (!ride.assigned_driver_id) {
      throw new ForbiddenError();
    }
    const driverRes = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM drivers WHERE id = $1 LIMIT 1`,
      [ride.assigned_driver_id],
    );
    const driverRow = driverRes.rows[0];
    if (!driverRow) {
      throw new ForbiddenError();
    }
    forUserId = driverRow.user_id;
  } else {
    if (!ride.assigned_driver_id) {
      throw new ForbiddenError();
    }
    const driverRes = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM drivers WHERE id = $1 LIMIT 1`,
      [ride.assigned_driver_id],
    );
    const driverRow = driverRes.rows[0];
    if (!driverRow || driverRow.user_id !== callerUserId) {
      throw new ForbiddenError();
    }
    forUserId = ride.rider_id;
  }

  const existingRes = await pool.query<{ id: string }>(
    `SELECT id FROM ratings WHERE ride_id = $1 AND by_user_id = $2 LIMIT 1`,
    [rideId, callerUserId],
  );
  if (existingRes.rows[0]) {
    throw new ConflictError('Already rated', undefined, 'ALREADY_RATED');
  }

  const client = await pool.connect();
  let inserted: RatingPgRow;
  try {
    await client.query('BEGIN');

    const insertRes = await client.query<RatingPgRow>(
      `INSERT INTO ratings (ride_id, by_user_id, for_user_id, stars, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ride_id, by_user_id, for_user_id, stars, comment, created_at`,
      [rideId, callerUserId, forUserId, stars, comment ?? null],
    );
    const row = insertRes.rows[0];
    if (!row) throw new Error('failed to insert rating');
    inserted = row;

    const avgRes = await client.query<{ avg: string | null }>(
      `SELECT avg(stars)::text AS avg FROM ratings WHERE for_user_id = $1`,
      [forUserId],
    );
    const avgValue = avgRes.rows[0]?.avg;
    const nextRating = avgValue == null ? '5.0' : roundToOneDecimal(Number(avgValue));

    await client.query(`UPDATE users SET rating = $1 WHERE id = $2`, [
      nextRating,
      forUserId,
    ]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return toRatingDto(inserted);
}
