CREATE TABLE IF NOT EXISTS "driver_online_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "driver_online_sessions" ADD CONSTRAINT "driver_online_sessions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_online_sessions_driver_active_idx" ON "driver_online_sessions" USING btree ("driver_id","ended_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_online_sessions_started_idx" ON "driver_online_sessions" USING btree ("started_at");