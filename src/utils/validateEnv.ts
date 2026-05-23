import { env } from '../config/env';
import { logger } from '../config/logger';

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Comprehensive environment validation for production readiness
 */
export function validateEnvironment(): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. Check Node Environment
  if (env.NODE_ENV === 'production') {
    logger.info('Running in PRODUCTION mode');
  } else {
    warnings.push(`Running in ${env.NODE_ENV} mode - not production`);
  }

  // 2. JWT Configuration
  if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY) {
    logger.info('✓ Using RS256 (asymmetric) JWT signing');
  } else {
    if (env.NODE_ENV === 'production') {
      errors.push('CRITICAL: Production should use RS256 JWT (JWT_PRIVATE_KEY and JWT_PUBLIC_KEY)');
    } else {
      warnings.push('Using HS256 JWT - switch to RS256 for production');
    }
  }

  // 3. Access Token TTL
  const accessTTL = env.JWT_ACCESS_TTL;
  if (accessTTL === '15m') {
    warnings.push('Access token TTL is 15m - consider increasing to 1h for better UX');
  }

  // 4. CORS Configuration
  if (!env.CORS_ORIGINS || env.CORS_ORIGINS.trim().length === 0) {
    if (env.NODE_ENV === 'production') {
      errors.push('CRITICAL: CORS_ORIGINS must be set in production');
    } else {
      warnings.push('CORS_ORIGINS not set - allowing all origins (dev only)');
    }
  } else {
    const origins = env.CORS_ORIGINS.split(',').map(s => s.trim());
    logger.info(`✓ CORS configured for ${origins.length} origin(s)`);
  }

  // 5. Database Configuration
  if (!env.DATABASE_URL.includes('sslmode=require') && env.NODE_ENV === 'production') {
    warnings.push('DATABASE_URL should include sslmode=require in production');
  }

  // 6. Firebase Configuration
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    logger.info('✓ Firebase configured for push notifications');
  } else {
    warnings.push('Firebase not fully configured - push notifications disabled');
  }

  // 7. SMS Configuration
  if (env.SMS_API_URL && env.SMS_API_KEY) {
    logger.info('✓ SMS gateway configured');
  } else {
    if (env.NODE_ENV === 'production') {
      errors.push('CRITICAL: SMS_API_URL and SMS_API_KEY required for OTP in production');
    } else {
      warnings.push('SMS not configured - OTPs will be logged only');
    }
  }

  // 8. Google Maps API
  if (env.GOOGLE_MAPS_API_KEY && env.GOOGLE_MAPS_API_KEY !== '__SET_VIA_CONFIG__') {
    logger.info('✓ Google Maps API configured');
  } else {
    errors.push('CRITICAL: GOOGLE_MAPS_API_KEY is required');
  }

  // 9. Connection Pool
  if (env.PG_POOL_MAX < 10 && env.NODE_ENV === 'production') {
    warnings.push(`PG_POOL_MAX is ${env.PG_POOL_MAX} - consider increasing to 20+ for production`);
  }

  // 10. Supabase Configuration
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.info('✓ Supabase configured');
  } else {
    warnings.push('Supabase not configured - using direct PostgreSQL only');
  }

  // 11. Dispatch Configuration
  logger.info(`✓ Dispatch: ${env.DISPATCH_INITIAL_RADIUS_KM}km initial, ${env.DISPATCH_EXPANDED_RADIUS_KM}km expanded`);

  // Summary
  const valid = errors.length === 0;
  
  if (warnings.length > 0) {
    logger.warn({ warnings }, 'Environment validation warnings');
  }
  
  if (errors.length > 0) {
    logger.error({ errors }, 'Environment validation errors');
  }

  if (valid && warnings.length === 0) {
    logger.info('✓ Environment validation passed - production ready');
  }

  return { valid, warnings, errors };
}

/**
 * Validate and exit if critical errors found
 */
export function validateOrExit(): void {
  const result = validateEnvironment();
  
  if (!result.valid) {
    logger.fatal({ errors: result.errors }, 'Environment validation failed');
    process.exit(1);
  }
  
  if (result.warnings.length > 0 && env.NODE_ENV === 'production') {
    logger.warn('Production environment has warnings - review before deploying');
  }
}
