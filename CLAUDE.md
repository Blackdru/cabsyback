# Cabsy Backend — agent guide

This is the Cabsy backend, the canonical source of truth for the open-bid
ride-hailing platform. Built per the master prompt's "NO ORM" rule:

- **Postgres access** uses raw `pg.Pool` queries (`src/db/client.ts`).
- **Supabase JS client** (`src/db/supabase.ts`) is **only** for "simple CRUD":
  single-row reads by PK or unique key, single-column updates, listing reads
  with no joins. Anything with `BEGIN/COMMIT`, `FOR UPDATE`, joins, aggregates,
  or PostGIS goes through `pg`. The bid acceptance flow MUST always go through
  `pg`.
- **Migrations** are hand-written `.sql` in `src/db/migrations/`, applied by
  `src/db/migrate.ts`. Use `npm run db:migrate` to apply pending migrations,
  `npm run db:baseline` once on environments that already have schema 0000–0004
  applied via the previous (drizzle-kit) tooling.
- **Column projections**: `src/db/projections.ts` exports `RIDE_COLS`,
  `DRIVER_COLS`, `BID_COLS`, `USER_COLS` with snake_case→camelCase aliasing.
  Reuse these instead of writing new SELECT lists.

## Deviations from master prompt

- **Firebase Admin** is used for OTP verification (`src/modules/auth/`) and
  FCM push (`src/services/push.ts`). The master prompt is silent on auth/push;
  this is a pragmatic deviation, not a violation. Required env vars:
  `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

## Required env vars

See `.env.example`. Critical ones:

- `DATABASE_URL` (pooled, port 6543) and `DATABASE_DIRECT_URL` (direct, port 5432)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_MAPS_API_KEY` (Directions API)
- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (RS256)
- `FIREBASE_*`

## Bid rules (locked — do not relax)

- 60-second bidding window
- Bid amounts must be 70–150% of `suggested_fare`
- Revisions can only go **down**
- One bid per driver per ride (DB unique constraint)
- Manual rider selection (`acceptBid`)
- `acceptBid` runs in a `BEGIN; SELECT … FOR UPDATE; UPDATE×4; COMMIT;`
  transaction in `src/modules/bids/bids.service.ts:acceptBid`. The `FOR UPDATE`
  lock on rides is the only thing serializing concurrent accept attempts.
