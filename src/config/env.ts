import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_DIRECT_URL: z.string().min(1, 'DATABASE_DIRECT_URL is required'),

  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),

  JWT_PRIVATE_KEY: z.string().min(1).optional(),
  JWT_PUBLIC_KEY: z.string().min(1).optional(),
  JWT_ACCESS_TTL: z.string().min(1).default('1h'), // Increased from 15m for better UX
  JWT_REFRESH_TTL: z.string().min(1).default('30d'),

  CORS_ORIGINS: z.string().optional(),

  // Connection pool + query timeouts (production tuning).
  PG_POOL_MAX: z.coerce.number().int().positive().default(20),
  PG_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  GOOGLE_MAPS_API_KEY: z.string().min(1, 'GOOGLE_MAPS_API_KEY is required'),

  DISPATCH_INITIAL_RADIUS_KM: z.coerce.number().positive().default(5),
  DISPATCH_EXPANDED_RADIUS_KM: z.coerce.number().positive().default(10),
  DISPATCH_EXPAND_AFTER_MS: z.coerce.number().int().positive().default(30_000),

  // SMS OTP API configuration
  SMS_API_URL: z.string().url().optional(),
  SMS_API_KEY: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
