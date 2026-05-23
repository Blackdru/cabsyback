import { pool } from '../../db/client';
import { supabase } from '../../db/supabase';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { OtpInvalidError, UnauthorizedError } from '../../errors';
import { requestOtp as sendOtp, verifyOtp as validateOtp } from '../../services/otp';
import type { AuthTokens, User, UserRole } from '../../shared/types';

interface UserRow {
  id: string;
  phone: string;
  name: string | null;
  rating: string;
  createdAt: Date;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    rating: Number(row.rating),
    createdAt: row.createdAt.toISOString(),
  };
}

async function findUserByPhone(phone: string): Promise<UserRow | undefined> {
  // Use direct PostgreSQL connection instead of Supabase client to avoid permission issues
  const { rows } = await pool.query<{
    id: string;
    phone: string;
    name: string | null;
    rating: string;
    created_at: Date;
  }>(
    `SELECT id, phone, name, rating, created_at 
     FROM users 
     WHERE phone = $1 
     LIMIT 1`,
    [phone]
  );
  
  if (rows.length === 0) return undefined;
  
  const row = rows[0];
  if (!row) return undefined;
  
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    rating: row.rating,
    createdAt: row.created_at,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

async function getOrCreateUserByPhone(phone: string): Promise<UserRow> {
  const existing = await findUserByPhone(phone);
  if (existing) return existing;

  try {
    // Use INSERT ... ON CONFLICT to handle race conditions
    const { rows } = await pool.query<{
      id: string;
      phone: string;
      name: string | null;
      rating: string;
      created_at: Date;
    }>(
      `INSERT INTO users (phone) 
       VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id, phone, name, rating, created_at`,
      [phone],
    );
    const row = rows[0];
    if (!row) throw new Error('failed to insert or fetch user');
    return {
      id: row.id,
      phone: row.phone,
      name: row.name,
      rating: row.rating,
      createdAt: row.created_at,
    };
  } catch (err) {
    throw err;
  }
}

async function resolveRole(userId: string): Promise<UserRole> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM drivers WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  return rows[0] ? 'driver' : 'rider';
}

/**
 * Request OTP for phone number
 * Sends OTP via SMS to the provided phone number
 */
export async function requestOtp(phone: string): Promise<void> {
  await sendOtp(phone);
}

/**
 * Verify OTP and authenticate user
 * Creates user if doesn't exist, returns user data and auth tokens
 */
export async function verifyOtpAndAuthenticate(
  phone: string,
  otp: string,
): Promise<{ user: User; tokens: AuthTokens }> {
  // Verify the OTP
  await validateOtp(phone, otp);

  // Get or create user
  const userRow = await getOrCreateUserByPhone(phone);
  const role = await resolveRole(userRow.id);

  // Generate tokens
  const accessToken = signAccessToken({ sub: userRow.id, role });
  const refreshToken = signRefreshToken({ sub: userRow.id });

  return {
    user: toUser(userRow),
    tokens: { accessToken, refreshToken },
  };
}

export async function refreshAccess(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  // Refresh-token rotation: each successful refresh issues BOTH a new access
  // token AND a new refresh token. Clients must replace the stored refresh
  // token on every refresh response, otherwise the next refresh will fail.
  //
  // The previous refresh token remains technically valid until expiry; full
  // server-side revocation requires a token-version column or denylist
  // (deferred — the rotation alone closes the largest token-replay risk).
  let sub: string;
  try {
    ({ sub } = verifyRefreshToken(refreshToken));
  } catch {
    throw new UnauthorizedError('Invalid refresh token', undefined, 'REFRESH_INVALID');
  }

  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE id = $1 LIMIT 1',
    [sub],
  );
  const userRow = rows[0];
  if (!userRow) {
    throw new UnauthorizedError('User not found', undefined, 'REFRESH_INVALID');
  }

  const role = await resolveRole(userRow.id);
  const accessToken = signAccessToken({ sub: userRow.id, role });
  const newRefreshToken = signRefreshToken({ sub: userRow.id });
  return { accessToken, refreshToken: newRefreshToken };
}

// Delete-my-account flow (GDPR / DPDP §16). Cascades through:
//   ride bids (FK ride_id ON DELETE CASCADE)
//   driver record (FK user_id ON DELETE CASCADE)
//   driver_online_sessions (FK driver_id ON DELETE CASCADE)
//   ratings (FK by_user_id, for_user_id — manual SET NULL via UPDATEs first)
// Rides are NOT deleted — they're historical records the assigned driver may
// still want for earnings reports. The user_id on rides is retained but the
// user row vanishes; treat the user as anonymized.
export async function deleteUserAccount(userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Detach historical ratings before deleting users (the FK is NOT cascade
    // because we don't want to lose historical scores for the surviving user).
    await client.query(
      `UPDATE ratings SET comment = NULL WHERE by_user_id = $1 OR for_user_id = $1`,
      [userId],
    );

    // The cascade does the rest (driver, sessions, bids via ride cascade,
    // idempotency keys via FK on user_id ON DELETE CASCADE).
    const del = await client.query<{ id: string }>(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [userId],
    );
    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new UnauthorizedError('User not found', undefined, 'NOT_FOUND');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
