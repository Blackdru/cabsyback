ALTER TABLE "drivers" ADD COLUMN "location" geography(Point, 4326);--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drivers_location_gist" ON "drivers" USING gist ("location");