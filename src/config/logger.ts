import pino from 'pino';
import { env } from './env';

const isDev = env.NODE_ENV !== 'production';

// PII / secret redaction. pino's `redact` walks any object passed to log(),
// replacing matched paths with `[Redacted]`. Be aggressive — better to
// over-redact than to leak phone numbers, JWTs, or private keys to log
// aggregators. Add new fields here when introducing new sensitive data.
const redactPaths = [
  // Auth + session
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'token',
  'tokens.accessToken',
  'tokens.refreshToken',
  'firebaseIdToken',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',

  // PII
  'phone',
  'phoneNumber',
  'user.phone',
  'rider.phone',
  'driver.phone',
  '*.phone',

  // Push
  'fcmToken',
  'fcm_token',

  // Secrets
  'FIREBASE_PRIVATE_KEY',
  'JWT_PRIVATE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_MAPS_API_KEY',
  'env.FIREBASE_PRIVATE_KEY',
  'env.JWT_PRIVATE_KEY',
  'env.SUPABASE_SERVICE_ROLE_KEY',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    censor: '[Redacted]',
    remove: false,
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
