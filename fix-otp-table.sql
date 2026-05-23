-- Fix OTP table schema
-- Drop the old constraint and add the correct one

-- Drop old constraint
ALTER TABLE otp_verifications DROP CONSTRAINT IF EXISTS unique_active_otp;

-- Add new partial unique constraint (only one unverified OTP per phone)
CREATE UNIQUE INDEX IF NOT EXISTS unique_unverified_otp 
  ON otp_verifications(phone) WHERE (verified = false);

-- Drop old indexes
DROP INDEX IF EXISTS otp_verifications_phone_idx;

-- Add better indexes
CREATE INDEX IF NOT EXISTS otp_verifications_expires_verified_idx
  ON otp_verifications(expires_at) WHERE verified = false;

CREATE INDEX IF NOT EXISTS otp_verifications_phone_verified_expires_idx
  ON otp_verifications(phone, verified, expires_at);

-- Clean up any duplicate unverified OTPs (keep most recent)
DELETE FROM otp_verifications a
USING otp_verifications b
WHERE a.phone = b.phone 
  AND a.verified = false 
  AND b.verified = false
  AND a.created_at < b.created_at;
