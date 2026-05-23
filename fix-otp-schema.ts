import { pool } from './src/db/client';
import { logger } from './src/config/logger';

async function fixOtpSchema() {
  const client = await pool.connect();
  try {
    logger.info('Fixing OTP table schema...');
    
    // Drop old constraint
    await client.query(`
      ALTER TABLE otp_verifications DROP CONSTRAINT IF EXISTS unique_active_otp;
    `);
    logger.info('Dropped old constraint');
    
    // Clean up any duplicate unverified OTPs (keep most recent)
    const { rowCount } = await client.query(`
      DELETE FROM otp_verifications a
      USING otp_verifications b
      WHERE a.phone = b.phone 
        AND a.verified = false 
        AND b.verified = false
        AND a.created_at < b.created_at;
    `);
    logger.info({ deletedRows: rowCount }, 'Cleaned up duplicate OTPs');
    
    // Add new partial unique constraint
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_unverified_otp 
        ON otp_verifications(phone) WHERE (verified = false);
    `);
    logger.info('Created new unique constraint');
    
    // Drop old indexes
    await client.query(`DROP INDEX IF EXISTS otp_verifications_phone_idx;`);
    await client.query(`DROP INDEX IF EXISTS otp_verifications_expires_idx;`);
    
    // Add better indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS otp_verifications_expires_verified_idx
        ON otp_verifications(expires_at) WHERE verified = false;
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS otp_verifications_phone_verified_expires_idx
        ON otp_verifications(phone, verified, expires_at);
    `);
    logger.info('Created new indexes');
    
    logger.info('OTP table schema fixed successfully!');
  } catch (error) {
    logger.error({ error }, 'Failed to fix OTP schema');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixOtpSchema().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
