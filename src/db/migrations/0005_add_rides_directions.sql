ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "duration_minutes" integer;
ALTER TABLE "rides" ADD COLUMN IF NOT EXISTS "polyline" text;
