import { logger } from '../config/logger';
import { cleanupExpiredOtps } from '../services/otp';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function runCleanup(): Promise<void> {
  try {
    const count = await cleanupExpiredOtps();
    if (count > 0) {
      logger.info({ count }, 'OTP cleanup completed');
    }
  } catch (error) {
    logger.error({ error }, 'OTP cleanup failed');
  }
}

export function startOtpCleanupJob(): NodeJS.Timeout {
  logger.info('starting OTP cleanup job');
  const handle = setInterval(() => {
    void runCleanup();
  }, CLEANUP_INTERVAL_MS);
  
  // Run immediately on startup
  void runCleanup();
  
  return handle;
}

export function stopOtpCleanupJob(handle: NodeJS.Timeout): void {
  clearInterval(handle);
  logger.info('OTP cleanup job stopped');
}
