DROP INDEX "contact_discovery_jobs_status_idx";--> statement-breakpoint
ALTER TABLE "contact_discovery_jobs" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_discovery_jobs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_discovery_jobs" ADD COLUMN "found_count" integer;--> statement-breakpoint
CREATE INDEX "contact_discovery_jobs_due_idx" ON "contact_discovery_jobs" USING btree ("status","next_attempt_at");