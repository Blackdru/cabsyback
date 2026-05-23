# Cabsy Backend

Node + Express + Socket.IO + Postgres (Supabase) + PostGIS. Source of truth for the rider and driver apps.

## Local setup
```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, SUPABASE_*, FIREBASE_*, JWT_*, GOOGLE_MAPS_API_KEY
npm run db:baseline    # one-time on a DB that already has 0000-0004 applied
npm run db:migrate
npm run dev
```

## Scripts
| Cmd | Purpose |
|---|---|
| `npm run dev` | tsx watch on :4000 |
| `npm run build` | tsc → dist/ |
| `npm run start` | prod: `node dist/server.js` |
| `npm run typecheck` | tsc --noEmit |
| `npm run db:migrate` | apply pending SQL migrations |
| `npm run db:baseline` | mark current migrations as applied (one-time) |

## Critical invariants — don't break these
- **No ORM.** Raw `pg.Pool` queries via `src/db/projections.ts` aliases.
- **`acceptBid` is transactional.** `BEGIN; SELECT … FOR UPDATE; UPDATE×4; COMMIT;` in `src/modules/bids/bids.service.ts`. The lock is what prevents double-acceptance.
- **Bid rules locked.** 60s window, 70-150% bounds, downward-only revisions, one bid per driver per ride, manual rider acceptance.
- **Background jobs use Postgres advisory locks** (`src/jobs/lock.ts`). Multi-instance safe.
- **PII redacted from logs** (`src/config/logger.ts`). Add new sensitive fields to `redactPaths`.

## Production deploy
- Container: `docker build -t backend .` (multi-stage, runs as non-root, exposes 4000).
- Env: copy `.env.example` to your platform's secret manager. Required: `DATABASE_URL`, `DATABASE_DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `GOOGLE_MAPS_API_KEY`. In prod also set `CORS_ORIGINS` (empty = reject all).
- Migrations: run `npm run db:migrate` against `DATABASE_DIRECT_URL` BEFORE rolling out new code.
- Health probes: `/health` (liveness), `/ready` (readiness — checks Postgres).
- Multi-instance: background jobs are Postgres-advisory-locked. `express-rate-limit` is in-memory — only sound at 1 replica until you swap it for a shared store.

## Account deletion
`DELETE /me` (auth required) cascades the user's data per GDPR / DPDP §16. Historical rides are retained for the assigned driver's earnings record; ratings comments are wiped.
