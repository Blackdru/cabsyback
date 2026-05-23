import { pool } from '../../db/client';
import { NotFoundError } from '../../errors';
import type { User } from '../../shared/types';

function toUserFromPg(row: {
  id: string;
  phone: string;
  name: string | null;
  rating: string;
  created_at: Date;
}): User {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    rating: Number(row.rating),
    createdAt: row.created_at.toISOString(),
  };
}

export async function getUserById(userId: string): Promise<User> {
  const { rows } = await pool.query<{
    id: string;
    phone: string;
    name: string | null;
    rating: string;
    created_at: Date;
  }>(
    `SELECT id, phone, name, rating, created_at 
     FROM users 
     WHERE id = $1 
     LIMIT 1`,
    [userId]
  );
  
  if (rows.length === 0) {
    throw new NotFoundError('User not found');
  }
  
  const row = rows[0];
  if (!row) {
    throw new NotFoundError('User not found');
  }
  
  return toUserFromPg(row);
}

export async function updateUser(
  userId: string,
  patch: { name?: string },
): Promise<User> {
  if (patch.name === undefined) {
    return getUserById(userId);
  }

  const { rows } = await pool.query<{
    id: string;
    phone: string;
    name: string | null;
    rating: string;
    created_at: Date;
  }>(
    `UPDATE users SET name = $1 WHERE id = $2
     RETURNING id, phone, name, rating, created_at`,
    [patch.name, userId],
  );
  const row = rows[0];
  if (!row) {
    throw new NotFoundError('User not found');
  }
  return toUserFromPg(row);
}

export async function setFcmToken(userId: string, token: string): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE users SET fcm_token = $1 WHERE id = $2 RETURNING id`,
    [token, userId]
  );
  
  if (rows.length === 0) {
    throw new NotFoundError('User not found');
  }
}
