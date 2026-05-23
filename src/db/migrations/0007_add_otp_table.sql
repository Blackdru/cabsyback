-- OTP authentication table
-- Stores OTPs for phone number verification, replacing Firebase authentication

CREATE TABLE IF NOT EXISTS otp_verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL,
  otp          text NOT NULL,
  verified     boolean NOT NULL DEFAULT false,
  attempts     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  verified_at  timestamptz,
  
  -- Only one unverified OTP per phone at a time
  CONSTRAINT unique_unverified_otp UNIQUE (phone) WHERE (verified = false)
);

-- Index for cleanup of expired OTPs
CREATE INDEX IF NOT EXISTS otp_verifications_expires_idx
  ON otp_verifications(expires_at) WHERE verified = false;

-- Index for phone lookup
CREATE INDEX IF NOT EXISTS otp_verifications_phone_verified_idx
  ON otp_verifications(phone, verified, expires_at);
