"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: zod_1.z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: zod_1.z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_DIRECT_URL: zod_1.z.string().min(1, 'DATABASE_DIRECT_URL is required'),
    SUPABASE_URL: zod_1.z.string().url('SUPABASE_URL must be a valid URL'),
    SUPABASE_SERVICE_ROLE_KEY: zod_1.z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
    FIREBASE_PROJECT_ID: zod_1.z.string().min(1).optional(),
    FIREBASE_CLIENT_EMAIL: zod_1.z.string().min(1).optional(),
    FIREBASE_PRIVATE_KEY: zod_1.z.string().min(1).optional(),
    JWT_PRIVATE_KEY: zod_1.z.string().min(1).optional(),
    JWT_PUBLIC_KEY: zod_1.z.string().min(1).optional(),
    JWT_ACCESS_TTL: zod_1.z.string().min(1).default('1h'), // Increased from 15m for better UX
    JWT_REFRESH_TTL: zod_1.z.string().min(1).default('30d'),
    CORS_ORIGINS: zod_1.z.string().optional(),
    // Connection pool + query timeouts (production tuning).
    PG_POOL_MAX: zod_1.z.coerce.number().int().positive().default(20),
    PG_STATEMENT_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(30_000),
    GOOGLE_MAPS_API_KEY: zod_1.z.string().min(1, 'GOOGLE_MAPS_API_KEY is required'),
    DISPATCH_INITIAL_RADIUS_KM: zod_1.z.coerce.number().positive().default(5),
    DISPATCH_EXPANDED_RADIUS_KM: zod_1.z.coerce.number().positive().default(10),
    DISPATCH_EXPAND_AFTER_MS: zod_1.z.coerce.number().int().positive().default(30_000),
    // SMS OTP API configuration
    SMS_API_URL: zod_1.z.string().url().optional(),
    SMS_API_KEY: zod_1.z.string().min(1).optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
}
exports.env = parsed.data;
//# sourceMappingURL=env.js.map