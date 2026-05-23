import { getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { pool } from '../db/client';
import { logger } from '../config/logger';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Best-effort push: never throw, never block the primary flow.
export async function sendNotification(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    if (getApps().length === 0) {
      logger.debug({ userId }, 'push: firebase admin not initialized, skipping');
      return;
    }

    const { rows } = await pool.query<{ fcm_token: string | null }>(
      'SELECT fcm_token FROM users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const token = rows[0]?.fcm_token;
    if (!token) {
      logger.debug({ userId }, 'push: no fcm token registered, skipping');
      return;
    }

    await getMessaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, userId }, 'push: send failed');
  }
}
