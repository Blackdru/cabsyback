-- Production hardening:
--   1. PostGIS extension (was assumed present; make explicit so vanilla pg works)
--   2. Composite index for the dispatch radius-expansion job's hot query
--   3. Index on drivers.last_seen_at for the stale-driver pruner
--   4. Idempotency-key table for safe client retries on createRide

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE INDEX IF NOT EXISTS rides_status_dispatch_idx
  ON rides(status, dispatch_expanded_at);

CREATE INDEX IF NOT EXISTS drivers_last_seen_idx
  ON drivers(last_seen_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key          text NOT NULL,
  request_hash text NOT NULL,
  response     jsonb NOT NULL,
  status_code  integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx
  ON idempotency_keys(expires_at);
